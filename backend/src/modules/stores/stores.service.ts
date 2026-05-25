import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Store } from './schemas/store.schema';
import { AdminUser, AdminUserDocument } from '../admin/schemas/admin-user.schema';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { StoreRepository } from './repositories/store.repository';
import { ProductRepository } from '../products/repositories/product.repository';
import { StoreStockService } from '../store-stock/store-stock.service';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class StoresService implements OnModuleInit {
  private readonly logger = new Logger(StoresService.name);
  private storesCache: Store[] | null = null;
  private storesCacheExpiresAt = 0;
  private static readonly STORES_TTL_MS = 60_000;

  constructor(
    private readonly storeRepository: StoreRepository,
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUserDocument>,
    private readonly productRepository: ProductRepository,
    private readonly storeStockService: StoreStockService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedStores();
    await this.seedStoreAdmins();
  }

  private async seedStores(): Promise<void> {
    const count = await this.storeRepository.countDocuments();
    if (count > 0) return;

    this.logger.log('Seeding default stores...');
    await this.storeRepository.insertMany([
      { name: 'Bhilai', code: 'bhilai', isMainStore: false, isActive: true },
      { name: 'Raipur', code: 'raipur', isMainStore: true, isActive: true },
      { name: 'Store 3', code: 'store3', isMainStore: false, isActive: true },
    ]);
    this.logger.log('Default stores seeded successfully');
  }

  private async seedStoreAdmins(): Promise<void> {
    const stores = await this.storeRepository.findAllSorted();
    const defaultPassword = 'Store@123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      const email = `${store.code}@naturelite.com`;
      const exists = await this.adminUserModel.findOne({ email });
      if (exists) {
        if (!store.adminEmail) {
          await this.storeRepository.updateOne(
            { _id: store._id },
            { adminEmail: email, adminPassword: defaultPassword },
          );
        }
        continue;
      }

      try {
        await this.adminUserModel.create({
          name: `${store.name} Admin`,
          email,
          password: hashedPassword,
          phone: `000${store.code}`,
          role: 'admin',
          store: store._id,
          isActive: true,
        });

        await this.storeRepository.updateOne(
          { _id: store._id },
          { adminEmail: email, adminPassword: defaultPassword },
        );

        this.logger.log(`Store admin created for ${store.name}: ${email}`);
      } catch (error: any) {
        if (error.code === 11000) {
          this.logger.warn(`Store admin for ${store.name} already exists, skipping`);
        } else {
          throw error;
        }
      }
    }
  }

  async create(dto: CreateStoreDto): Promise<Store> {
    this.invalidateStoresCache();
    const saved = await this.storeRepository.create(dto as Partial<Store>);

    try {
      const productDocs = await this.productRepository.getModel().find().select('_id').lean().exec();
      if (productDocs.length > 0) {
        const productIds = productDocs.map((p: { _id: unknown }) => String(p._id));
        for (const productId of productIds) {
          await this.storeStockService.initializeStockForProduct(productId, [saved._id.toString()]);
        }
        this.logger.log(`Initialized StoreStock for ${productDocs.length} product(s) in new store ${saved.name}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize StoreStock for new store ${saved.name}: ${(error as Error).message}`);
    }

    return saved;
  }

  async findAll(): Promise<Store[]> {
    if (this.storesCache && this.storesCacheExpiresAt > Date.now()) {
      return this.storesCache;
    }
    const stores = await this.storeRepository.findAllSorted();
    this.storesCache = stores;
    this.storesCacheExpiresAt = Date.now() + StoresService.STORES_TTL_MS;
    return stores;
  }

  invalidateStoresCache(): void {
    this.storesCache = null;
    this.storesCacheExpiresAt = 0;
  }

  async findById(id: string): Promise<Store> {
    const idObj = parseObjectId(id, 'id');
    const store = await this.storeRepository.findById(idObj);
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async findByCode(code: string): Promise<Store> {
    const store = await this.storeRepository.findOneByCode(code);
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async findMainStore(): Promise<Store> {
    const store = await this.storeRepository.findOneMainStore();
    if (!store) throw new NotFoundException('Main store not configured');
    return store;
  }

  async update(id: string, dto: UpdateStoreDto): Promise<Store> {
    const idObj = parseObjectId(id, 'id');
    const store = await this.storeRepository.findByIdAndUpdate(idObj, { $set: dto });
    if (!store) throw new NotFoundException('Store not found');
    this.invalidateStoresCache();
    return store;
  }

  async resetStorePassword(storeId: string, newPassword: string): Promise<{ message: string }> {
    const storeObjId = parseObjectId(storeId, 'storeId');
    const admin = await this.adminUserModel.findOne({ store: storeObjId });
    if (!admin) throw new NotFoundException('No admin account found for this store');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.adminUserModel.updateOne(
      { _id: admin._id },
      { password: hashedPassword },
    );

    await this.storeRepository.updateOne(
      { _id: storeObjId },
      { adminPassword: newPassword },
    );

    return { message: `Password updated for ${admin.email}` };
  }
}
