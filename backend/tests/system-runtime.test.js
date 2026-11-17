import { it, expect } from "vitest";
import { app } from "../index.js";
import { getAuthCookie } from "./testUtils.js";
it("serializes runtime metadata through the authenticated system route", async () => {
 const cookie = await getAuthCookie();
 const response = await app.handle(new Request("http://localhost/api/v1/system/status", { headers: { Cookie: cookie } }));
 expect(response.status).toBe(200);
 const body = await response.json();
 expect(body.runtime.bunVersion).toBe(Bun.version);
 expect(body.runtime.platform).toBe(process.platform);
 expect(body.runtime.uptimeSeconds).toBeGreaterThanOrEqual(0);
});
