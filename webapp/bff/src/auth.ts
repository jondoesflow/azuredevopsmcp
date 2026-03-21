import { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { AppConfig, AuthenticatedUser } from "./types.js";

const GRAPH_GROUPS_CLAIM = "groups";

function parseBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match?.[1];
}

function hasAllowedGroup(userGroups: string[], allowedGroupIds: string[]): boolean {
  if (allowedGroupIds.length === 0) return true;
  return userGroups.some((groupId) => allowedGroupIds.includes(groupId));
}

function buildUser(payload: JWTPayload): AuthenticatedUser {
  const groupsRaw = payload[GRAPH_GROUPS_CLAIM];
  const groups = Array.isArray(groupsRaw) ? groupsRaw.filter((value): value is string => typeof value === "string") : [];

  return {
    objectId: (payload.oid as string) ?? "",
    tenantId: (payload.tid as string) ?? "",
    groups,
    displayName: typeof payload.name === "string" ? payload.name : undefined,
  };
}

function resolveAllowedAudiences(configuredAudience: string): string[] {
  const values = new Set<string>();
  const raw = configuredAudience.trim();
  if (!raw) return [];

  values.add(raw);
  if (raw.startsWith("api://")) {
    values.add(raw.slice("api://".length));
  } else {
    values.add(`api://${raw}`);
  }

  return [...values];
}

export function createAuthMiddleware(config: AppConfig) {
  if (config.authMode === "off") {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.entraTenantId}/discovery/v2.0/keys`));
  const audiences = resolveAllowedAudiences(config.entraAudience);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ error: "Missing bearer token" });
        return;
      }

      const verified = await jwtVerify(token, jwks, {
        audience: audiences,
      });

      const user = buildUser(verified.payload);
      if (!user.objectId || !user.tenantId) {
        res.status(401).json({ error: "Token is missing required identity claims" });
        return;
      }

      if (user.tenantId !== config.entraTenantId) {
        res.status(401).json({ error: "Token tenant is not allowed" });
        return;
      }

      if (!hasAllowedGroup(user.groups, config.allowedGroupIds)) {
        res.status(403).json({ error: "User is not in an allowed security group" });
        return;
      }

      (req as Request & { user?: AuthenticatedUser }).user = user;
      next();
    } catch {
      res.status(401).json({ error: "Invalid bearer token" });
    }
  };
}
