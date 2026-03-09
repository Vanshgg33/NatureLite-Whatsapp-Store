import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, AddAddressDto, UpdateAddressDto, UserQueryDto } from './dto/user.dto';
import { User } from './schemas/user.schema';
import { PaginatedResult } from '../../common/types/pagination.types';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(dto: CreateUserDto): Promise<User>;
    findAll(query: UserQueryDto): Promise<PaginatedResult<User>>;
    getMyProfile(userId: string): Promise<User>;
    findOne(id: string): Promise<User>;
    updateMyProfile(userId: string, dto: UpdateUserDto): Promise<User>;
    update(id: string, dto: UpdateUserDto): Promise<User>;
    addMyAddress(userId: string, dto: AddAddressDto): Promise<User>;
    updateMyAddress(userId: string, index: string, dto: UpdateAddressDto): Promise<User>;
    removeMyAddress(userId: string, index: string): Promise<User>;
    blockUser(id: string, reason: string): Promise<User>;
    unblockUser(id: string): Promise<User>;
    delete(id: string): Promise<{
        message: string;
    }>;
}
