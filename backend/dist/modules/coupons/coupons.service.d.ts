import { Coupon } from './schemas/coupon.schema';
import { CouponRepository } from './repositories/coupon.repository';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto, CouponQueryDto } from './dto/coupon.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
export interface CouponValidationResult {
    valid: boolean;
    message: string;
    discountAmount: number;
    coupon?: Coupon;
    minOrderAmount?: number;
}
export declare class CouponsService {
    private readonly couponRepository;
    constructor(couponRepository: CouponRepository);
    create(dto: CreateCouponDto): Promise<Coupon>;
    findAll(query: CouponQueryDto): Promise<PaginatedResult<Coupon>>;
    findById(id: string): Promise<Coupon>;
    findByCode(code: string): Promise<Coupon>;
    validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult>;
    incrementUsageCount(couponCode: string): Promise<void>;
    update(id: string, dto: UpdateCouponDto): Promise<Coupon>;
    delete(id: string): Promise<void>;
    getActiveCoupons(): Promise<Coupon[]>;
}
