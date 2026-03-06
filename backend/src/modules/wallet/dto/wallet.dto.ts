import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class AdminAdjustWalletDto {
  /**
   * Amount in rupees that admin wants to credit/debit.
   * Will be converted to paise in the service layer.
   */
  @IsInt()
  @IsPositive()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  note?: string;
}

export interface WalletBalanceResponse {
  /** Balance in rupees for display. */
  balance: number;
  currency: 'INR';
}

export interface WalletTransactionResponse {
  id: string;
  type: 'credit' | 'debit';
  amount: number; // rupees
  reason: string;
  createdAt: Date;
  orderId?: string;
  meta?: Record<string, unknown>;
}

