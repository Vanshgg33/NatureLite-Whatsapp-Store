// Form validation utilities

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Product validation
export interface ProductFormData {
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  price: string;
  compareAtPrice: string;
  sku: string;
  stock: string;
  lowStockThreshold: string;
  hsnCode: string;
  tags: string;
}

export function validateProduct(data: ProductFormData): ValidationResult {
  const errors: ValidationError[] = [];

  // Name validation
  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Product name is required' });
  } else if (data.name.trim().length < 3) {
    errors.push({ field: 'name', message: 'Product name must be at least 3 characters' });
  } else if (data.name.trim().length > 200) {
    errors.push({ field: 'name', message: 'Product name must be less than 200 characters' });
  }

  // Category validation
  if (!data.category) {
    errors.push({ field: 'category', message: 'Category is required' });
  }

  // Price validation
  const price = parseFloat(data.price);
  if (!data.price || isNaN(price)) {
    errors.push({ field: 'price', message: 'Valid price is required' });
  } else if (price <= 0) {
    errors.push({ field: 'price', message: 'Price must be greater than 0' });
  } else if (price > 10000000) {
    errors.push({ field: 'price', message: 'Price seems too high' });
  }

  // Compare at price validation
  if (data.compareAtPrice) {
    const compareAtPrice = parseFloat(data.compareAtPrice);
    if (isNaN(compareAtPrice)) {
      errors.push({ field: 'compareAtPrice', message: 'Invalid compare at price' });
    } else if (compareAtPrice <= price) {
      errors.push({ field: 'compareAtPrice', message: 'Compare at price should be higher than selling price' });
    }
  }

  // SKU validation
  if (!data.sku.trim()) {
    errors.push({ field: 'sku', message: 'SKU is required' });
  } else if (!/^[A-Za-z0-9-_]+$/.test(data.sku.trim())) {
    errors.push({ field: 'sku', message: 'SKU can only contain letters, numbers, hyphens, and underscores' });
  }

  // Stock validation
  const stock = parseInt(data.stock);
  if (isNaN(stock) || stock < 0) {
    errors.push({ field: 'stock', message: 'Stock must be 0 or greater' });
  }

  // Low stock threshold validation
  const lowStockThreshold = parseInt(data.lowStockThreshold);
  if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
    errors.push({ field: 'lowStockThreshold', message: 'Low stock threshold must be 0 or greater' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Category validation
export interface CategoryFormData {
  name: string;
  description: string;
  parent: string;
  sortOrder: string;
}

export function validateCategory(data: CategoryFormData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.name.trim()) {
    errors.push({ field: 'name', message: 'Category name is required' });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Category name must be at least 2 characters' });
  } else if (data.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Category name must be less than 100 characters' });
  }

  if (data.sortOrder) {
    const sortOrder = parseInt(data.sortOrder);
    if (isNaN(sortOrder) || sortOrder < 0) {
      errors.push({ field: 'sortOrder', message: 'Sort order must be a positive number' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Coupon validation
export interface CouponFormData {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maxDiscount: string;
  minOrderAmount: string;
  maxUsageCount: string;
  validFrom: string;
  validUntil: string;
}

export function validateCoupon(data: CouponFormData): ValidationResult {
  const errors: ValidationError[] = [];

  // Code validation
  if (!data.code.trim()) {
    errors.push({ field: 'code', message: 'Coupon code is required' });
  } else if (!/^[A-Z0-9_-]+$/.test(data.code.trim())) {
    errors.push({ field: 'code', message: 'Coupon code can only contain uppercase letters, numbers, hyphens, and underscores' });
  } else if (data.code.length < 3 || data.code.length > 20) {
    errors.push({ field: 'code', message: 'Coupon code must be between 3 and 20 characters' });
  }

  // Description validation
  if (!data.description.trim()) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  // Discount value validation
  const discountValue = parseFloat(data.discountValue);
  if (!data.discountValue || isNaN(discountValue)) {
    errors.push({ field: 'discountValue', message: 'Valid discount value is required' });
  } else if (discountValue <= 0) {
    errors.push({ field: 'discountValue', message: 'Discount value must be greater than 0' });
  } else if (data.discountType === 'percentage' && discountValue > 100) {
    errors.push({ field: 'discountValue', message: 'Percentage discount cannot exceed 100%' });
  }

  // Max discount validation (for percentage)
  if (data.discountType === 'percentage' && data.maxDiscount) {
    const maxDiscount = parseFloat(data.maxDiscount);
    if (isNaN(maxDiscount) || maxDiscount <= 0) {
      errors.push({ field: 'maxDiscount', message: 'Max discount must be greater than 0' });
    }
  }

  // Min order amount validation
  if (data.minOrderAmount) {
    const minOrderAmount = parseFloat(data.minOrderAmount);
    if (isNaN(minOrderAmount) || minOrderAmount < 0) {
      errors.push({ field: 'minOrderAmount', message: 'Min order amount must be 0 or greater' });
    }
  }

  // Date validation
  if (!data.validFrom) {
    errors.push({ field: 'validFrom', message: 'Start date is required' });
  }
  if (!data.validUntil) {
    errors.push({ field: 'validUntil', message: 'End date is required' });
  }
  if (data.validFrom && data.validUntil) {
    const from = new Date(data.validFrom);
    const until = new Date(data.validUntil);
    if (until <= from) {
      errors.push({ field: 'validUntil', message: 'End date must be after start date' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Helper to get error message for a field
export function getFieldError(errors: ValidationError[], field: string): string | undefined {
  return errors.find(e => e.field === field)?.message;
}
