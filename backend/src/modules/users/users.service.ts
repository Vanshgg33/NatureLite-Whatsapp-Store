import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import {
  CreateUserDto,
  UpdateUserDto,
  AddAddressDto,
  UpdateAddressDto,
  UserQueryDto,
} from './dto/user.dto';
import { PaginatedResult, paginate } from '@/common/types/pagination.types';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({ phone: dto.phone });

    if (existingUser) {
      throw new BadRequestException('User with this phone already exists');
    }

    const user = new this.userModel(dto);
    return user.save();
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 20, search, isActive, isBlocked, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { phone: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    if (isBlocked !== undefined) {
      filter.isBlocked = isBlocked;
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [users, total] = await Promise.all([
      this.userModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.userModel.countDocuments(filter),
    ]);

    return paginate(users, total, { page, limit });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone });
  }

  async findOrCreateByPhone(phone: string): Promise<User> {
    let user = await this.userModel.findOne({ phone });

    if (!user) {
      user = new this.userModel({ phone });
      await user.save();
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async addAddress(userId: string, dto: AddAddressDto): Promise<User> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    user.addresses.push({
      ...dto,
      isDefault: dto.isDefault ?? false,
    });
    return user.save();
  }

  async updateAddress(
    userId: string,
    addressIndex: number,
    dto: UpdateAddressDto,
  ): Promise<User> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (addressIndex < 0 || addressIndex >= user.addresses.length) {
      throw new BadRequestException('Invalid address index');
    }

    if (dto.isDefault) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    Object.assign(user.addresses[addressIndex], dto);
    return user.save();
  }

  async removeAddress(userId: string, addressIndex: number): Promise<User> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (addressIndex < 0 || addressIndex >= user.addresses.length) {
      throw new BadRequestException('Invalid address index');
    }

    user.addresses.splice(addressIndex, 1);
    return user.save();
  }

  async blockUser(userId: string, reason: string): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isBlocked: true, blockedReason: reason },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async unblockUser(userId: string): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { isBlocked: false, $unset: { blockedReason: 1 } },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateOrderStats(userId: string, orderTotal: number): Promise<void> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      {
        $inc: { totalOrders: 1, totalSpent: orderTotal },
        $set: { lastOrderAt: new Date() },
      },
    );
  }

  async updateLastInteraction(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { lastInteractionAt: new Date() } },
    );
  }

  async delete(id: string): Promise<void> {
    const result = await this.userModel.deleteOne({ _id: new Types.ObjectId(id) });

    if (result.deletedCount === 0) {
      throw new NotFoundException('User not found');
    }
  }
}
