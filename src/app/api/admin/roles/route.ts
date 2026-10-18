import { api } from "@/server/http";
import { listRoles } from "@/server/services/users";

export const GET = api({ permission: "users.manage" }, async () => listRoles());
