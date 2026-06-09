import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { StoreSale, SaleItem } from './schemas/store-sale.schema';
import { StoreSaleRepository } from './repositories/store-sale.repository';
import { StoreRepository } from '../stores/repositories/store.repository';
import { ProductRepository } from '../products/repositories/product.repository';
import { StoreStockService } from '../store-stock/store-stock.service';
import { ProductsService } from '../products/products.service';
import { CreateStoreSaleDto, UpdateStoreSaleDto, SaleQueryDto } from './dto/store-sale.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId } from '../../common/utils/objectid.util';
import { RemindersService } from '../reminders/reminders.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StoreSalesService {
  private readonly logger = new Logger(StoreSalesService.name);

  constructor(
    private readonly storeSaleRepository: StoreSaleRepository,
    private readonly storeRepository: StoreRepository,
    private readonly productRepository: ProductRepository,
    private storeStockService: StoreStockService,
    private productsService: ProductsService,
    private remindersService: RemindersService,
    private readonly mediaService: MediaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateStoreSaleDto, loggedBy: string): Promise<StoreSale> {
    const storeIdObj = parseObjectId(dto.storeId, 'storeId');
    const store = await this.storeRepository.findById(storeIdObj);
    if (!store) throw new NotFoundException('Store not found');

    for (const item of dto.items) {
      parseObjectId(item.productId, 'items[].productId');
      const storeStock = await this.storeStockService.getStockForStoreProduct(
        dto.storeId,
        item.productId,
      );
      const available = storeStock
        ? item.variantSku
          ? (storeStock.variantStocks?.find((v) => v.variantSku === item.variantSku)?.stock ?? 0)
          : (storeStock.stock ?? 0)
        : 0;
      if (available < item.quantity) {
        const product = await this.productRepository.findByIdString(item.productId);
        const name = product?.name ?? item.productId;
        throw new BadRequestException(
          `Insufficient stock for "${name}". Available: ${available}, requested: ${item.quantity}`,
        );
      }
    }

    const saleItems: SaleItem[] = [];
    let subtotal = 0;

    for (const item of dto.items) {
      const product = await this.productRepository.findByIdString(item.productId);
      if (!product) throw new BadRequestException(`Product ${item.productId} not found`);

      let price = product.price;
      let variantName: string | undefined;

      if (item.variantSku) {
        const variant = product.variants.find((v) => v.sku === item.variantSku);
        if (!variant) throw new BadRequestException(`Variant ${item.variantSku} not found`);
        price = variant.price;
        variantName = variant.name;
      }

      const total = price * item.quantity;
      saleItems.push({
        product: new Types.ObjectId(item.productId),
        name: product.name,
        variantSku: item.variantSku,
        variantName,
        quantity: item.quantity,
        price,
        total,
      });
      subtotal += total;
    }

    const discount = dto.discount || 0;
    const total = Math.max(0, subtotal - discount);
    const saleNumber = await this.generateSaleNumber(store.code);

    const saleData = {
      saleNumber,
      store: storeIdObj,
      saleType: dto.saleType,
      items: saleItems,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerAddress: dto.customerAddress,
      subtotal,
      discount,
      total,
      paymentMethod: dto.paymentMethod || 'cash',
      paymentProofUrl: dto.paymentProofUrl,
      images: dto.images || [],
      notes: dto.notes,
      loggedBy: new Types.ObjectId(loggedBy),
    };

    const sale = await this.storeSaleRepository.create(saleData as Partial<StoreSale>);

    if (dto.reminderMessage && dto.reminderDueAt) {
      const dueAt = new Date(dto.reminderDueAt);
      if (!isNaN(dueAt.getTime())) {
        await this.remindersService.createForSale(
          sale._id.toString(),
          dto.storeId,
          dto.reminderMessage,
          dueAt,
          loggedBy,
        );
      }
    }

    for (const item of dto.items) {
      await this.storeStockService.decrementStock(
        dto.storeId,
        item.productId,
        item.quantity,
        item.variantSku,
      );
    }
    for (const item of dto.items) {
      await this.productsService.incrementTotalSold(item.productId, item.quantity);
    }

    return sale;
  }

  async createFromOrder(order: any, storeId: string): Promise<StoreSale> {
    const store = await this.storeRepository.findByIdString(storeId);
    if (!store) throw new NotFoundException('Store not found');

    const saleNumber = await this.generateSaleNumber(store.code);

    const saleItems: SaleItem[] = order.items.map((item: any) => ({
      product: item.product,
      name: item.name,
      variantSku: item.variantSku,
      variantName: item.variantName,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    }));

    const addr = order.shippingAddress;
    const customerAddress = [
      addr?.street,
      addr?.landmark,
      addr?.city,
      addr?.state,
      addr?.pincode ? `PIN-${addr.pincode}` : undefined,
    ].filter(Boolean).join(', ') || undefined;

    const saleData = {
      saleNumber,
      store: new Types.ObjectId(storeId),
      saleType: 'website' as const,
      items: saleItems,
      customerName: order.shippingAddress?.name,
      customerPhone: order.shippingAddress?.phone,
      customerAddress,
      subtotal: order.subtotal,
      discount: order.discount || 0,
      total: order.total,
      paymentMethod: order.paymentMethod,
      linkedOrder: order._id,
    };

    return this.storeSaleRepository.create(saleData as Partial<StoreSale>);
  }

  async findAll(query: SaleQueryDto): Promise<PaginatedResult<StoreSale>> {
    return this.storeSaleRepository.findAllPaginated(query);
  }

  async findByStore(storeId: string, query: SaleQueryDto): Promise<PaginatedResult<StoreSale>> {
    return this.storeSaleRepository.findByStorePaginated(storeId, query);
  }

  async findById(id: string): Promise<StoreSale> {
    const sale = await this.storeSaleRepository.findByIdWithPopulate(id);
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async update(id: string, dto: UpdateStoreSaleDto): Promise<StoreSale> {
    const sale = await this.storeSaleRepository.findByIdWithPopulate(id);
    if (!sale) throw new NotFoundException('Sale not found');

    const storeObj = sale.store;
    const storeId = (typeof storeObj === 'object' && storeObj && 'name' in storeObj)
      ? (storeObj as { _id: Types.ObjectId })._id.toString()
      : (storeObj as Types.ObjectId).toString();
    if (storeId !== dto.storeId) {
      throw new BadRequestException('Sale does not belong to the specified store');
    }

    const storeIdStr = dto.storeId;
    let saleItems: SaleItem[] = (sale.items || []) as SaleItem[];
    let subtotal = sale.subtotal;
    let total = sale.total;

    if (dto.items && dto.items.length > 0) {
      for (const item of saleItems) {
        const productId = (item.product as any)?.toString?.() ?? (item.product as Types.ObjectId).toString();
        await this.storeStockService.incrementStock(storeIdStr, productId, item.quantity, item.variantSku);
        await this.productsService.incrementTotalSold(productId, -item.quantity);
      }

      for (const item of dto.items) {
        parseObjectId(item.productId, 'items[].productId');
        const storeStock = await this.storeStockService.getStockForStoreProduct(storeIdStr, item.productId);
        const available = storeStock
          ? item.variantSku
            ? (storeStock.variantStocks?.find((v) => v.variantSku === item.variantSku)?.stock ?? 0)
            : (storeStock.stock ?? 0)
          : 0;
        if (available < item.quantity) {
          const product = await this.productRepository.findByIdString(item.productId);
          const name = product?.name ?? item.productId;
          throw new BadRequestException(
            `Insufficient stock for "${name}". Available: ${available}, requested: ${item.quantity}`,
          );
        }
      }

      saleItems = [];
      subtotal = 0;

      for (const item of dto.items) {
        const product = await this.productRepository.findByIdString(item.productId);
        if (!product) throw new BadRequestException(`Product ${item.productId} not found`);

        let price = product.price;
        let variantName: string | undefined;

        if (item.variantSku) {
          const variant = product.variants.find((v) => v.sku === item.variantSku);
          if (!variant) throw new BadRequestException(`Variant ${item.variantSku} not found`);
          price = variant.price;
          variantName = variant.name;
        }

        const itemTotal = price * item.quantity;
        saleItems.push({
          product: new Types.ObjectId(item.productId),
          name: product.name,
          variantSku: item.variantSku,
          variantName,
          quantity: item.quantity,
          price,
          total: itemTotal,
        });
        subtotal += itemTotal;

        await this.storeStockService.decrementStock(storeIdStr, item.productId, item.quantity, item.variantSku);
        await this.productsService.incrementTotalSold(item.productId, item.quantity);
      }

      const discount = dto.discount ?? sale.discount;
      total = Math.max(0, subtotal - discount);
    } else {
      const discount = dto.discount ?? sale.discount;
      total = Math.max(0, subtotal - discount);
    }

    const updateData: Partial<StoreSale> = {};
    if (dto.saleType) updateData.saleType = dto.saleType;
    if (dto.customerName !== undefined) updateData.customerName = dto.customerName;
    if (dto.customerPhone !== undefined) updateData.customerPhone = dto.customerPhone;
    if (dto.customerAddress !== undefined) updateData.customerAddress = dto.customerAddress;
    if (dto.paymentMethod !== undefined) updateData.paymentMethod = dto.paymentMethod;
    if (dto.paymentProofUrl !== undefined) updateData.paymentProofUrl = dto.paymentProofUrl;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    if (dto.items && dto.items.length > 0) {
      updateData.items = saleItems;
      updateData.subtotal = subtotal;
      updateData.discount = dto.discount ?? sale.discount;
      updateData.total = total;
    } else {
      if (dto.discount !== undefined) {
        updateData.discount = dto.discount;
        updateData.total = Math.max(0, sale.subtotal - dto.discount);
      }
    }

    const updated = await this.storeSaleRepository.findByIdAndUpdate(id, { $set: updateData });
    return updated!;
  }

  async voidByLinkedOrder(orderId: string, reason: string): Promise<void> {
    const orderIdObj = parseObjectId(orderId, 'orderId');
    await this.storeSaleRepository.voidByLinkedOrder(orderIdObj, reason);
  }

  async getSaleStats(
    storeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, unknown>> {
    return this.storeSaleRepository.getSaleStats(storeId, startDate, endDate);
  }

  async getRevenueByStoreByDay(
    days: number = 30,
  ): Promise<Array<{ storeId: string; storeName: string; data: Array<{ date: string; revenue: number; sales: number }> }>> {
    return this.storeSaleRepository.getRevenueByStoreByDay(days);
  }

  async storeSaleInvoice(id: string, pdfBase64: string, filename: string): Promise<{ url: string }> {
    const idObj = parseObjectId(id, 'id');
    const sale = await this.storeSaleRepository.findById(idObj);
    if (!sale) throw new NotFoundException('Sale not found');

    const buffer = Buffer.from(pdfBase64, 'base64');
    const result = await this.mediaService.uploadPdfBuffer(buffer, 'invoices/sales', filename);

    (sale as any).invoiceUrl = result.secureUrl;
    await (sale as any).save();
    return { url: result.secureUrl };
  }

  async sendSaleInvoiceToCustomer(id: string): Promise<{ sent: boolean }> {
    const idObj = parseObjectId(id, 'id');
    const sale = await this.storeSaleRepository.findById(idObj);
    if (!sale) throw new NotFoundException('Sale not found');
    if (!(sale as any).invoiceUrl) throw new BadRequestException('No invoice found for this sale. Generate it first.');

    const phone = sale.customerPhone?.trim();
    if (!phone) throw new BadRequestException('No customer phone found for this sale.');

    await this.notificationsService.sendInvoiceDocument(sale.saleNumber, phone, (sale as any).invoiceUrl);
    return { sent: true };
  }

  private async generateSaleNumber(storeCode: string): Promise<string> {
    const prefix = storeCode.toUpperCase().slice(0, 3);
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const pattern = `${prefix}${dateStr}`;
    const lastSale = await this.storeSaleRepository.findOneBySaleNumberPrefix(pattern);
    let sequence = 1;
    if (lastSale) {
      const lastSeq = parseInt(lastSale.saleNumber.slice(-4), 10);
      sequence = lastSeq + 1;
    }
    return `${pattern}-${sequence.toString().padStart(4, '0')}`;
  }
}
