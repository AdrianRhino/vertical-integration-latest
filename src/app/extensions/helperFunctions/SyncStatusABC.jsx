import React, { useState, useEffect } from "react";
import { Text, Flex } from "@hubspot/ui-extensions";
import { readManifest, getPages } from "./catalogCache";
import { hubspot } from "@hubspot/ui-extensions";

function fmt(dt) {
  if (!dt) return "-";
  try {
    const d = new Date(dt);
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  } catch (error) {
    return dt;
  }
}

export default function SyncStatusABC() {
  const [status, setStatus] = useState({
    lastFullSyncAt: null,
    lastDeltaSyncAt: null,
    totalPages: null,
    pagesSaved: 0,
    updatedAt: null,
  });

  async function refresh() {
    try {
      const manifest = await readManifest("abc", "abc:all");
      const pages = await getPages("abc", "abc:all");
      
      // Safely compute pagesSaved
      const pagesSaved =
        Number.isFinite(manifest?.pagesSaved) ? manifest.pagesSaved
        : Array.isArray(manifest?.pages) ? manifest.pages.length
        : (manifest?.pageCounts ? Object.keys(manifest.pageCounts).length : 0);

      // Try to get totalPages from manifest first, then from ABC API
      let totalPages = manifest?.totalPages;
      if (!totalPages) {
        // Note: To fetch from ABC API, you'd need the access token
        // const abcResponse = await hubspot.serverless('fetchAbcPage', {
        //   parameters: { abcAccessToken: 'your-token', pageNumber: 1, itemsPerPage: 1 }
        // });
        // totalPages = abcResponse?.body?.data?.pagination?.totalPages;
      }
      
      setStatus({
        lastFullSyncAt: manifest?.lastFullSyncAt || null,
        lastDeltaSyncAt: manifest?.lastDeltaSyncAt || null,
        totalPages,                 // number or null
        pagesSaved,                 // number
        updatedAt: manifest?.updatedAt || null,
      });
    } catch (error) {
      console.error("Error refreshing sync status:", error);
       setStatus({
         lastFullSyncAt: null,
         lastDeltaSyncAt: null,
         totalPages: null,
         pagesSaved: 0,
         updatedAt: null,
       });
    }
  }

  return (
    <Flex direction="column" gap="small">
      <Text format="heading">ABC Catalog Sync Status</Text>
      <Text>Last Full Sync: {fmt(status.lastFullSyncAt)}</Text>
      <Text>Last Delta Sync: {fmt(status.lastDeltaSyncAt)}</Text>
      <Text>Total Pages: {status.totalPages ?? "-"}</Text>
      <Text>
        Pages Saved: {status.pagesSaved}
        {status.totalPages ? ` / ${status.totalPages}` : ''}
      </Text>
      <Text>Updated At: {fmt(status.updatedAt)}</Text>
    </Flex>
  );
}
