import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BooksService } from './books.service';
import { BillingStockService } from './billing-stock.service';
import { RequireAccess } from '../../common/decorators/require-access.decorator';

@Controller('billing/books')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class BooksController {
  constructor(private readonly books: BooksService, private readonly stock: BillingStockService) {}

  @RequireAccess('billing_books.view')
  @Get('accounts') listAccounts() { return this.books.listAccounts(); }
  @RequireAccess('billing_books.edit')
  @Post('accounts') createAccount(@Body() b: any) { return this.books.createAccount(b); }
  @RequireAccess('billing_books.edit')
  @Patch('accounts/:id') updateAccount(@Param('id') id: string, @Body() b: any) { return this.books.updateAccount(id, b); }

  @RequireAccess('billing_books.view')
  @Get('opening') getOpening() { return this.books.getOpening(); }
  @RequireAccess('billing_books.edit')
  @Put('opening') setOpening(@Body() b: any) { return this.books.setOpening(b); }

  @RequireAccess('billing_books.view')
  @Get('payments') listPayments(@Query() q: any) { return this.books.listPayments(q); }
  @RequireAccess('billing_books.edit')
  @Post('payments') createPayment(@Body() b: any) { return this.books.createPayment(b); }
  @RequireAccess('billing_books.edit')
  @Patch('payments/:id/cheque') setCheque(@Param('id') id: string, @Body() b: any) { return this.books.setChequeStatus(id, b); }

  @RequireAccess('billing_books.view')
  @Get('expenses') listExpenses(@Query() q: any) { return this.books.listExpenses(q); }
  @RequireAccess('billing_books.edit')
  @Post('expenses') createExpense(@Body() b: any) { return this.books.createExpense(b); }
  @RequireAccess('billing_books.delete')
  @Delete('expenses/:id') deleteExpense(@Param('id') id: string) { return this.books.deleteExpense(id); }

  @RequireAccess('billing_books.view')
  @Get('stock-entries') listStock() { return this.books.listStockEntries(); }
  @RequireAccess('billing_books.edit')
  @Post('stock-entries') createStock(@Body() b: any) { return this.books.createStockEntry(b); }

  @RequireAccess('billing_books.edit')
  @Post('stock-transfer') transferStock(@Body() b: any) { return this.stock.transfer(b); }

  @RequireAccess('billing_books.view')
  @Get('purchases') listPurchases(@Query() q: any) { return this.books.listPurchases(q); }
  @RequireAccess('billing_books.edit')
  @Post('purchases') createPurchase(@Body() b: any) { return this.books.createPurchase(b); }
  @RequireAccess('billing_books.delete')
  @Patch('purchases/:id/cancel') cancelPurchase(@Param('id') id: string) { return this.books.cancelPurchase(id); }
}
