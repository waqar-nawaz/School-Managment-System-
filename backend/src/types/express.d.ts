declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: string;
        claims: string[];
        branchId?: number | null;
      };
    }
  }
}

export {};