import { IsString, IsNumber, IsDateString, IsEnum, MinLength, IsOptional } from 'class-validator'

export class CreateRuleDto {
  @IsEnum(['hsn','category','item']) scope: string
  @IsOptional() @IsString() hsnPrefix?: string
  @IsOptional() @IsString() categoryId?: string
  @IsOptional() @IsString() itemId?: string
  @IsNumber() gstRate: number
  @IsNumber() @IsOptional() cessRate?: number
  @IsEnum(['taxable','nil','exempt','non_gst']) taxability: string
  @IsDateString() effectiveFrom: string
  @IsString() @MinLength(10) reason: string
}
