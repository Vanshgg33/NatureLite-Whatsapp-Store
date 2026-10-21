import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BooksService } from './books.service';

@Controller('billing/books')
@UseGuards(RolesGuard)
@Roles('admin', 'superadmin')
export class BooksController {
  constructor(private readonly books: BooksService) {}

  @Get('accounts') listAccounts() { return this.books.listAccounts(); }
  @Post('accounts') createAccount(@Body() b: any) { return this.books.createAccount(b); }
  @Patch('accounts/:id') updateAccount(@Param('id') id: string, @Body() b: any) { return this.books.updateAccount(id, b); }

  @Get('opening') getOpening() { return this.books.getOpening(); }
  @Put('opening') setOpening(@Body() b: any) { return this.books.setOpening(b); }

  @Get('payments') listPayments(@Query() q: any) { return this.books.listPayments(q); }
  @Post('payments') createPayment(@Body() b: any) { return this.books.createPayment(b); }
  @Patch('payments/:id/cheque') setCheque(@Param('id') id: string, @Body() b: any) { return this.books.setChequeStatus(id, b); }

  @Get('expenses') listExpenses(@Query() q: any) { return this.books.listExpenses(q); }
  @Post('expenses') createExpense(@Body() b: any) { return this.books.createExpense(b); }
  @Delete('expenses/:id') deleteExpense(@Param('id') id: string) { return this.books.deleteExpense(id); }

  @Get('stock-entries') listStock() { return this.books.listStockEntries(); }
  @Post('stock-entries') createStock(@Body() b: any) { return this.books.createStockEntry(b); }

  @Get('purchases') listPurchases(@Query() q: any) { return this.books.listPurchases(q); }
  @Post('purchases') createPurchase(@Body() b: any) { return this.books.createPurchase(b); }
  @Patch('purchases/:id/cancel') cancelPurchase(@Param('id') id: string) { return this.books.cancelPurchase(id); }
}
