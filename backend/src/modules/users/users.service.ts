import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { User } from './schemas/user.schema';
import { UserRepository } from './repositories/user.repository';
import {
  CreateUserDto,
  UpdateUserDto,
  AddAddressDto,
  UpdateAddressDto,
  UserQueryDto,
} from './dto/user.dto';
import { PaginatedResult } from '../../common/types/pagination.types';
import { parseObjectId } from '../../common/utils/objectid.util';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  // Strips non-digits, adds 91 prefix for 10-digit Indian numbers.
  // Returns null for anything that can't be a valid phone after cleanup.
  static normalizePhone(raw: string): string | null {
    const digits = (raw || '').replace(/[^\d]/g, '');
    let n = digits;
    if (n.length === 10) n = '91' + n;
    else if (n.length === 11 && n.startsWith('0')) n = '91' + n.slice(1);
    return n.length >= 10 ? n : null;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const normalizedPhone = UsersService.normalizePhone(dto.phone) ?? dto.phone;
    const existingUser = await this.userRepository.findOneByPhone(normalizedPhone);
    if (existingUser) {
      throw new BadRequestException('User with this phone already exists');
    }
    return this.userRepository.create({ ...dto, phone: normalizedPhone } as Partial<User>);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedResult<User>> {
    return this.userRepository.findAllPaginated(query);
  }

  async findById(id: string): Promise<User> {
    const idObj = parseObjectId(id, 'id');
    const user = await this.userRepository.findById(idObj);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const normalized = UsersService.normalizePhone(phone) ?? phone;
    return this.userRepository.findOneByPhone(normalized);
  }

  async findManyByPhones(phones: string[]): Promise<User[]> {
    const normalized = phones.map(p => UsersService.normalizePhone(p) ?? p);
    return this.userRepository.findManyByPhones(normalized);
  }

  /**
   * Set the display name for a user identified by phone. Creates the user record
   * if it doesn't exist yet (admin is naming a chat-only contact whose account
   * hasn't been provisioned by a login/OTP yet).
   */
  async setNameByPhone(phone: string, name: string): Promise<User> {
    if (!phone) throw new BadRequestException('Phone is required');
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Name cannot be empty');
    }
    const normalized = UsersService.normalizePhone(phone) ?? phone;
    const userDoc = await this.userRepository.findOrCreateByPhoneAtomic(normalized);
    userDoc.name = trimmed;
    return userDoc.save();
  }

  /**
   * Same phone is treated as the same user (used for guest checkout and OTP login).
   * If a guest later registers with the same phone, they get the same account.
   */
  async findOrCreateByPhone(phone: string): Promise<User> {
    if (!phone) throw new BadRequestException('Phone is required');
    const normalized = UsersService.normalizePhone(phone) ?? phone;
    return this.userRepository.findOrCreateByPhoneAtomic(normalized);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const idObj = parseObjectId(id, 'id');
    const user = await this.userRepository.findByIdAndUpdate(idObj, { $set: dto });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async addAddress(userId: string, dto: AddAddressDto): Promise<User> {
    const userObjId = parseObjectId(userId, 'userId');
    const user = await this.userRepository.findById(userObjId);
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
    const userObjId = parseObjectId(userId, 'userId');
    const user = await this.userRepository.findById(userObjId);
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
    const userObjId = parseObjectId(userId, 'userId');
    const user = await this.userRepository.findById(userObjId);
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
    const userObjId = parseObjectId(userId, 'userId');
    const user = await this.userRepository.findByIdAndUpdate(userObjId, {
      isBlocked: true,
      blockedReason: reason,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async unblockUser(userId: string): Promise<User> {
    const userObjId = parseObjectId(userId, 'userId');
    const user = await this.userRepository.findByIdAndUpdate(userObjId, {
      isBlocked: false,
      $unset: { blockedReason: 1 },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateOrderStats(userId: string, orderTotal: number): Promise<void> {
    const userObjId = parseObjectId(userId, 'userId');
    await this.userRepository.updateOne(
      { _id: userObjId },
      {
        $inc: { totalOrders: 1, totalSpent: orderTotal },
        $set: { lastOrderAt: new Date() },
      },
    );
  }

  async updateLastInteraction(userId: string): Promise<void> {
    const userObjId = parseObjectId(userId, 'userId');
    await this.userRepository.updateOne(
      { _id: userObjId },
      { $set: { lastInteractionAt: new Date() } },
    );
  }

  async delete(id: string): Promise<void> {
    const idObj = parseObjectId(id, 'id');
    const result = await this.userRepository.deleteOne({ _id: idObj });
    if (result.deletedCount === 0) {
      throw new NotFoundException('User not found');
    }
  }
}
