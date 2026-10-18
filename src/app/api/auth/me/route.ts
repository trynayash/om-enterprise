import { api } from "@/server/http";
import { publicActor } from "@/server/auth/actor";

export const GET = api({ allowPasswordChangePending: true }, async ({ actor }) => publicActor(actor));
