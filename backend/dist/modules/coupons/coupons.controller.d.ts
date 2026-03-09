import { CouponsService, CouponValidationResult } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto, CouponQueryDto } from './dto/coupon.dto';
import { Coupon } from './schemas/coupon.schema';
import { PaginatedResult } from '../../common/types/pagination.types';
export declare class CouponsController {
    private readonly couponsService;
    constructor(couponsService: CouponsService);
    create(dto: CreateCouponDto): Promise<Coupon>;
    findAll(query: CouponQueryDto): Promise<PaginatedResult<Coupon>>;
    getActiveCoupons(): Promise<Coupon[]>;
    validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult>;
    findByCode(code: string): Promise<Coupon>;
    findOne(id: string): Promise<Coupon>;
    update(id: string, dto: UpdateCouponDto): Promise<Coupon>;
    delete(id: string): Promise<{
        message: string;
    }>;
}
