import { api } from "@/server/http";
import { importTemplateCsv } from "@/server/services/import";

export const GET = api({ permission: "catalog.import" }, async () =>
  new Response(`﻿${importTemplateCsv()}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="om-product-import-template.csv"' },
  }),
);
