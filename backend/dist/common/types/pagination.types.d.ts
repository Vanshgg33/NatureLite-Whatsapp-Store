export interface PaginationOptions {
    page: number;
    limit: number;
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}
export declare function paginate<T>(items: T[], total: number, options: PaginationOptions): PaginatedResult<T>;
