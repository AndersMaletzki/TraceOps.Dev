export type MissingTenantIdError = {
  code: "missing_tenant_id";
  message: string;
};

export type TenantResolution =
  | {
      ok: true;
      tenantId: string;
    }
  | {
      ok: false;
      error: MissingTenantIdError;
    };

export type TraceOpsMcpContext = {
  defaultTenantId?: string;
};

export function resolveTenantId(inputTenantId?: string, defaultTenantId?: string): TenantResolution {
  if (inputTenantId) {
    return {
      ok: true,
      tenantId: inputTenantId
    };
  }

  if (defaultTenantId) {
    return {
      ok: true,
      tenantId: defaultTenantId
    };
  }

  return {
    ok: false,
    error: {
      code: "missing_tenant_id",
      message: "tenantId is required when TRACEOPS_DEFAULT_TENANT_ID is not configured."
    }
  };
}
