import { Request, Response, NextFunction } from 'express';
export declare function tenantMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function scopeMiddleware(requiredScopes: string[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function enforceResourceIsolation(tenantId: string, resourceId: string): Promise<boolean>;
