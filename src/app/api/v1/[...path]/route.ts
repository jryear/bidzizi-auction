import { handle, notFound } from "../../../../server/v1/http";
import { inviteStaff, listStaff, login, logout, resetStaffPassword, setStaffPassword } from "../../../../server/v1/auth";
import { bidReceipt, join, placeBid, pledge, rejoin, snapshot, previewSnapshot, watch } from "../../../../server/v1/engine";
import * as host from "../../../../server/v1/host";
import * as telemetry from "../../../../server/v1/telemetry";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ path: string[] }> };

async function route(method: string, request: Request, ctx: Ctx): Promise<Response> {
  const p = (await ctx.params).path;
  const at = (...parts: string[]) => p.length === parts.length && parts.every((part, i) => part === "*" || part === p[i]);

  // Participants: /api/v1/e/:code/...
  if (p[0] === "e" && p[1]) {
    const code = p[1];
    if (method === "GET" && at("e", "*")) return snapshot(request, code);
    if (method === "POST" && at("e", "*", "join")) return join(request, code);
    if (method === "POST" && at("e", "*", "rejoin")) return rejoin(request, code);
    if (method === "POST" && at("e", "*", "bid")) return placeBid(request, code);
    if (method === "GET" && at("e", "*", "receipt", "*")) return bidReceipt(request, code, p[3]);
    if (method === "POST" && at("e", "*", "watch")) return watch(request, code);
    if (method === "POST" && at("e", "*", "pledge")) return pledge(request, code);
    if (method === "POST" && at("e", "*", "telemetry")) return telemetry.guestReport(request, code);
  }
  if (method === "GET" && at("assets", "*")) return host.readAsset(p[1]);

  // Staff: /api/v1/host/...
  if (p[0] === "host") {
    if (method === "POST" && at("host", "login")) return login(request);
    if (method === "POST" && at("host", "logout")) return logout(request);
    if (method === "POST" && at("host", "password", "set")) return setStaffPassword(request);
    if (method === "GET" && at("host", "me")) return host.me(request);
    if (method === "POST" && at("host", "telemetry")) return telemetry.staffReport(request);
    if (method === "GET" && at("host", "staff")) return listStaff(request);
    if (method === "POST" && at("host", "staff", "invites")) return inviteStaff(request);
    if (method === "POST" && at("host", "staff", "*", "password-reset")) return resetStaffPassword(request, p[2]);
    if (method === "POST" && at("host", "assets")) return host.uploadAsset(request);
    if (method === "GET" && at("host", "events")) return host.listEvents(request);
    if (method === "POST" && at("host", "events")) return host.createEvent(request);
    if (p[1] === "events" && p[2]) {
      const e = p[2];
      if (method === "GET" && at("host", "events", "*")) return host.workspace(request, e);
      if (method === "GET" && at("host", "events", "*", "preview")) return previewSnapshot(request, e);
      if (method === "GET" && at("host", "events", "*", "stage")) return host.stageView(request, e);
      if (method === "GET" && at("host", "events", "*", "devices")) return telemetry.eventDevices(request, e);
      if (method === "PATCH" && at("host", "events", "*")) return host.updateEvent(request, e);
      if (method === "POST" && at("host", "events", "*", "duplicate")) return host.duplicateEvent(request, e);
      if (method === "POST" && at("host", "events", "*", "reset")) return host.resetPractice(request, e);
      if (method === "POST" && at("host", "events", "*", "archive")) return host.archiveEvent(request, e);
      if (method === "POST" && at("host", "events", "*", "restore")) return host.restoreEvent(request, e);
      if (method === "DELETE" && at("host", "events", "*")) return host.deleteEvent(request, e);
      if (method === "POST" && at("host", "events", "*", "items")) return host.createItem(request, e);
      if (method === "POST" && at("host", "events", "*", "items", "order")) return host.reorderItems(request, e);
      if (method === "POST" && at("host", "events", "*", "items", "batch")) return host.createItems(request, e);
      if (method === "PATCH" && at("host", "events", "*", "items")) return host.updateItems(request, e);
      if (method === "POST" && at("host", "events", "*", "items", "delete")) return host.deleteItems(request, e);
      if (method === "POST" && at("host", "events", "*", "categories")) return host.editCategories(request, e);
      if (method === "PUT" && at("host", "events", "*", "sponsors")) return host.saveSponsors(request, e);
      if (method === "POST" && at("host", "events", "*", "recipients")) return host.saveRecipient(request, e);
      if (method === "DELETE" && at("host", "events", "*", "recipients", "*")) return host.removeRecipient(request, e, p[4]);
      if (method === "PATCH" && at("host", "events", "*", "participants", "*")) return host.updateParticipant(request, e, p[4]);
      if (method === "POST" && at("host", "events", "*", "participants", "*", "rejoin")) return host.issueRejoin(request, e, p[4]);
      if (method === "PATCH" && at("host", "events", "*", "pledges", "*")) return host.processPledge(request, e, p[4]);
      if (method === "GET" && at("host", "events", "*", "export", "*")) return host.exportCsv(request, e, p[4]);
    }
    if (p[1] === "items" && p[2]) {
      if (method === "PATCH" && at("host", "items", "*")) return host.updateItem(request, p[2]);
      if (method === "DELETE" && at("host", "items", "*")) return host.deleteItem(request, p[2]);
      if (method === "POST" && at("host", "items", "*", "award")) return host.decideAward(request, p[2]);
      if (method === "POST" && at("host", "items", "*", "void-bid")) return host.voidBid(request, p[2]);
      if (method === "POST" && at("host", "items", "*", "withdraw")) return host.withdrawItem(request, p[2]);
    }
  }
  throw notFound();
}

const verb = (method: string) => (request: Request, ctx: Ctx) => handle(() => route(method, request, ctx));
export const GET = verb("GET"), POST = verb("POST"), PATCH = verb("PATCH"), PUT = verb("PUT"), DELETE = verb("DELETE");
