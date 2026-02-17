import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto, UpdateUserDto, AddAddressDto, UpdateAddressDto, UserQueryDto } from './dto/user.dto';
import { PaginatedResult } from '@/common/types/pagination.types';
export declare class UsersService {
    private userModel;
    constructor(userModel: Model<UserDocument>);
    create(dto: CreateUserDto): Promise<User>;
    findAll(query: UserQueryDto): Promise<PaginatedResult<User>>;
    findById(id: string): Promise<User>;
    findByPhone(phone: string): Promise<User | null>;
    findOrCreateByPhone(phone: string): Promise<User>;
    update(id: string, dto: UpdateUserDto): Promise<User>;
    addAddress(userId: string, dto: AddAddressDto): Promise<User>;
    updateAddress(userId: string, addressIndex: number, dto: UpdateAddressDto): Promise<User>;
    removeAddress(userId: string, addressIndex: number): Promise<User>;
    blockUser(userId: string, reason: string): Promise<User>;
    unblockUser(userId: string): Promise<User>;
    updateOrderStats(userId: string, orderTotal: number): Promise<void>;
    updateLastInteraction(userId: string): Promise<void>;
    delete(id: string): Promise<void>;
}
