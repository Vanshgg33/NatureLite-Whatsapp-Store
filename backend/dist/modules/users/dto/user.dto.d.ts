export declare class AddressDto {
    label: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
    isDefault?: boolean;
}
export declare class CreateUserDto {
    phone: string;
    name?: string;
    email?: string;
    addresses?: AddressDto[];
}
export declare class UpdateUserDto {
    name?: string;
    email?: string;
    isActive?: boolean;
    isBlocked?: boolean;
    blockedReason?: string;
    notes?: string;
    tags?: string[];
}
export declare class AddAddressDto extends AddressDto {
}
export declare class UpdateAddressDto {
    label?: string;
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    landmark?: string;
    isDefault?: boolean;
}
export declare class UserQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    isBlocked?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
