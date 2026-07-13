import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: 'customer' | 'admin' | 'superadmin';
  storeId?: string;
  storeName?: string;
  /** Set for department staff (packing/billing/delivery) and CRM roles; they must not access admin-only routes */
  departmentType?: 'packing' | 'billing' | 'delivery' | 'crm_head' | 'crm_senior';
  iat?: number;
  exp?: number;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;

    if (data) {
      return user[data] as string;
    }

    return user;
  },
);
