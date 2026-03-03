import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

const OBJECT_ID_HEX_LENGTH = 24;

/**
 * Returns true only for non-empty strings that are valid 24-char hex ObjectIds.
 * Use this before casting to ObjectId to avoid Mongoose CastError (e.g. for "" or invalid IDs).
 */
export function isValidObjectIdString(value: unknown): value is string {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.length !== OBJECT_ID_HEX_LENGTH) return false;
  return /^[a-f0-9]{24}$/i.test(value) && Types.ObjectId.isValid(value);
}

/**
 * Converts a string to ObjectId. Throws BadRequestException if the value is empty or invalid.
 * Use for required IDs from params, query, or body.
 */
export function parseObjectId(value: unknown, fieldName = 'id'): Types.ObjectId {
  if (!isValidObjectIdString(value)) {
    throw new BadRequestException(
      `Invalid ${fieldName}: must be a 24-character hex string`,
    );
  }
  return new Types.ObjectId(value);
}

/**
 * Converts a string to ObjectId if it's valid; otherwise returns undefined.
 * Use for optional IDs (e.g. query params, optional body fields).
 */
export function parseObjectIdOptional(
  value: unknown,
  fieldName = 'id',
): Types.ObjectId | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (!isValidObjectIdString(value)) return undefined;
  return new Types.ObjectId(value);
}

/**
 * Filters an array to only valid ObjectId strings and maps to ObjectId[].
 * Skips empty/invalid entries so they don't cause CastError in $in queries.
 */
export function parseObjectIdArray(
  values: unknown[] | undefined | null,
  fieldName = 'ids',
): Types.ObjectId[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const valid = values.filter((v): v is string => isValidObjectIdString(v));
  return valid.map((id) => new Types.ObjectId(id));
}
