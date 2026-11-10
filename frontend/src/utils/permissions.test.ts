import { expect, it } from "vitest";
import { availableEvents, receiver, transitions } from "./permissions";
import type { Lot, Role, User } from "../types";
const user = (role: Role, regionCode = "TG-001", orgMsp = "Org1MSP"): User => ({
  username: role,
  userId: `${role}-user`,
  organizationId: `${role}-org`,
  permissions: ["TRANSPORT_RECORD","LOT_CREATE","LOT_HARVEST","LOT_PROCESS","HANDOVER_CREATE","HANDOVER_CONFIRM","LOT_DISPATCH","LOT_DISPLAY_SALE","LOT_RECALL"],
  role,
  actorId: role,
  orgMsp,
  regionCode,
});
const lot: Lot = {schemaVersion:4,currentHolderOrganizationId:"FARMER-org",
  lotId: "LOT",
  ownerOrganizationId: "FARMER-org",
  processorOrganizationId: "PROCESSOR-org",
  distributorOrganizationId: "DISTRIBUTOR-org",
  pendingToOrganizationId: "TRANSPORTER-org",
  productName: "Xoài",
  origin: "TG",
  harvestDate: "2026-10-28",
  status: "CREATED",
  regionCode: "TG-001",
  currentHolder: "farmer",
  createdAt: "2026-10-28",
  eventCount: 1,
  lastEventId: "1",
};
it("allows exactly the correct role at every normal transition", () => {
  for (const transition of transitions) {
    const current = {
      ...lot,
      status: transition.from as Lot["status"],
      currentHolderOrganizationId:`${transition.role}-org`,
      pendingToOrganizationId:`${transition.role}-org`,
      pendingTo: transition.role==="DISTRIBUTOR"?"Org3MSP":transition.role==="PROCESSOR"?"Org1MSP":"Org2MSP",
      pendingToRegion: "TG-001",
    };
    for (const role of [
      "ADMIN",
      "FARMER",
      "PROCESSOR",
      "TRANSPORTER",
      "DISTRIBUTOR",
    ] as const)
      expect(
        availableEvents(
          user(role, "TG-001", role === "DISTRIBUTOR" ? "Org3MSP" : role === "TRANSPORTER" ? "Org2MSP" : "Org1MSP"),
          current,
        ).includes(transition.type),
      ).toBe(role === transition.role);
  }
});
it("requires receiver MSP and region even for a visible lot", () => {
  const pending = {
    ...lot,
    status: "WAITING_SHIP" as const,
    pendingTo: "Org2MSP",
    pendingToRegion: "HN",
  };
  expect(availableEvents(user("TRANSPORTER"), pending)).not.toContain(
    "CTE_RECEIVE_SHIP",
  );
  expect(
    availableEvents(user("TRANSPORTER", "HN", "Org3MSP"), pending),
  ).toEqual([]);
  expect(
    availableEvents(user("TRANSPORTER", "HN", "Org2MSP"), pending),
  ).toEqual(["CTE_RECEIVE_SHIP","CTE_RECALL"]);
});
it("locks recalled lots, denies other regions/admin and permits standalone recall", () => {
  expect(
    availableEvents(user("FARMER"), { ...lot, status: "RECALLED" }),
  ).toEqual([]);
  expect(availableEvents(user("FARMER", "OTHER"), lot)).toEqual(["CTE_RECALL"]);
  expect(availableEvents(user("ADMIN"), lot)).toEqual([]);
  expect(
    availableEvents(user("FARMER"), { ...lot, status: "READY_FOR_SALE" }),
  ).toEqual(["CTE_RECALL"]);
});
it("recovers pending destination from history and clears it after receiving", () => {
  const event = {
    eventId: "1",
    eventType: "CTE_HANDOVER_SHIP" as const,
    timestamp: "2026",
    location: "x",
    actorRole: "PROCESSOR" as const,
    previousEventId: null,
    dataHash: "x",
    data: { toOrg: "Org2MSP", toRegion: "TG-001" },
  };
  expect(receiver({ ...lot, events: [event] })).toEqual({
    org: "Org2MSP",
    region: "TG-001",
  });
  expect(
    receiver({
      ...lot,
      events: [
        event,
        { ...event, eventId: "2", eventType: "CTE_RECEIVE_SHIP", data: {} },
      ],
    }),
  ).toEqual({ org: "", region: "" });
});

it('requires assigned business organization and server permissions even within one MSP', () => {
  const pending = {...lot,status:'WAITING_SHIP' as const,pendingTo:'Org2MSP',pendingToRegion:'TG-001'};
  expect(availableEvents({...user('TRANSPORTER','TG-001','Org2MSP'),organizationId:'another-logistics'},pending)).not.toContain('CTE_RECEIVE_SHIP');
  expect(availableEvents({...user('FARMER'),permissions:[]},lot)).toEqual([]);
});
