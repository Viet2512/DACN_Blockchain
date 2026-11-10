import { afterEach, expect, it, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { api, ApiError, authService, lotService, TOKEN_KEY } from "./api";
const original = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = original;
  vi.restoreAllMocks();
});
it("sends session bearer only on private requests and encodes lot IDs", async () => {
  sessionStorage.setItem(TOKEN_KEY, "private-test-token");
  const configs: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    configs.push(config);
    return { config, status: 200, statusText: "OK", headers: {}, data: [] };
  };
  await lotService.list();
  await lotService.publicTrace("LOT /1");
  await authService.login({ username: "u", password: "p" });
  expect(configs[0].headers.Authorization).toBe("Bearer private-test-token");
  expect(configs[1].headers.Authorization).toBeUndefined();
  expect(configs[2].headers.Authorization).toBeUndefined();
  expect(configs[1].url).toContain("LOT%20%2F1");
});
it("clears expired sessions and dispatches auth event on 401", async () => {
  sessionStorage.setItem(TOKEN_KEY, "expired");
  const listener = vi.fn();
  window.addEventListener("tracechain-session-expired", listener);
  api.defaults.adapter = async (config) => {
    throw new AxiosError("unauthorized", "401", config, null, {
      config,
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      data: { error: "Authentication required" },
    });
  };
  await expect(authService.me()).rejects.toBeInstanceOf(ApiError);
  expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  window.removeEventListener("tracechain-session-expired", listener);
});
it("marks write timeout as uncertain without retry", async () => {
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError("network timeout", "ECONNABORTED", config);
  });
  api.defaults.adapter = adapter;
  await expect(
    lotService.record("LOT", {
      eventType: "CTE_RECALL",
      location: "x",
      previousEventId: "prev",
      data: { note: "test" },
    }),
  ).rejects.toMatchObject({ uncertain: true });
  expect(adapter).toHaveBeenCalledOnce();
});
it("keeps structured errors for rejected transitions", async () => {
  api.defaults.adapter = async (config) => {
    throw new AxiosError("conflict", "409", config, null, {
      config,
      status: 409,
      statusText: "Conflict",
      headers: {},
      data: { step: "State", code: "FSM_INVALID", message: "Sai trạng thái" },
    });
  };
  await expect(lotService.validate("LOT")).rejects.toMatchObject({
    status: 409,
    step: "State",
    code: "FSM_INVALID",
    uncertain: false,
  });
});
it('keeps a confirmed ledger commit distinct from an unknown write outcome',async()=>{
 api.defaults.adapter=async config=>{throw new AxiosError('projection failure','503',config,null,{config,status:503,statusText:'Unavailable',headers:{},data:{ledgerCommitted:true,transactionId:'tx-proof',reconciliationRequired:true}});};
 await expect(lotService.record('LOT',{eventType:'CTE_TRANSPORT',location:'Depot',previousEventId:'previous',data:{}})).rejects.toMatchObject({uncertain:true,message:expect.stringContaining('tx-proof')});
});

it.each(['FABRIC_IDENTITY_REQUIRED','FABRIC_IDENTITY_MISMATCH'])('explains %s instead of reporting a missing business permission',async(code)=>{
 const message='Tài khoản chưa có chứng thư Fabric phù hợp để ký giao dịch.';
 api.defaults.adapter=async config=>{throw new AxiosError('identity unavailable','403',config,null,{config,status:403,statusText:'Forbidden',headers:{},data:{step:'Identity',code,message}});};
 await expect(lotService.create({lotId:'LOT',productName:'Xoài',origin:'TG',harvestDate:'2026-11-08',location:'TG',regionCode:'TG-001'})).rejects.toMatchObject({status:403,code,message,uncertain:false});
});

it('still reports a real permission denial as forbidden',async()=>{
 api.defaults.adapter=async config=>{throw new AxiosError('forbidden','403',config,null,{config,status:403,statusText:'Forbidden',headers:{},data:{step:'Identity',code:'RBAC_DENIED',message:'Role cannot write'}});};
 await expect(lotService.list()).rejects.toMatchObject({status:403,message:'Bạn không có quyền thực hiện thao tác này.'});
});
