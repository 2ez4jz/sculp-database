// Demo projection only: production must build this on the server under RLS.
export function searchCatalog({
  bookings,
  artists,
  partners,
  notes,
  client,
  serviceName,
  context,
}) {
  const global = context.role === "admin";
  const bookingIds = new Set(bookings.map((b) => b.id));
  const partnerIds = new Set(bookings.flatMap((b) => b.partnerIds));
  const byId = (rows, id) => rows.find((row) => row.id === id);
  return {
    bookings: bookings.map((b) => ({
      id: b.id,
      date: b.date,
      status: b.status,
      service: b.service,
      artistIds: b.artistIds,
      venueId: b.venueId,
      partnerIds: b.partnerIds,
      ...(global ? { price: b.price } : {}),
      label: `${client(b.clientId).name} · ${serviceName[b.service]} · ${b.date}`,
      searchText: [
        client(b.clientId).name,
        serviceName[b.service],
        ...b.partnerIds.map((id) => byId(partners, id).name),
        ...b.artistIds.map((id) => byId(artists, id).name),
      ].join(" "),
    })),
    artists: (global
      ? artists
      : artists.filter((a) => a.id === context.artistId)
    ).map(({ id, name, level, specialties }) => ({
      id,
      name,
      level,
      specialties,
    })),
    partners: (global
      ? partners
      : partners.filter((p) => partnerIds.has(p.id))
    ).map(({ id, name, type }) => ({ id, name, type })),
    notes: notes
      .filter((n) => bookingIds.has(n.entityId))
      .map((n) => ({
        id: n.id,
        entityId: n.entityId,
        rawText: n.rawText,
        aiSummary: n.aiSummary,
        structuredData: {
          preferences: n.structuredData?.preferences || [],
          ...(global
            ? { opportunities: n.structuredData?.opportunities || [] }
            : {}),
        },
      })),
  };
}

// Never render model-supplied URLs. Resolve only IDs in the submitted catalog.
export function searchLinks(results, catalog) {
  const routes = {
    booking: "bookings",
    artist: "artists",
    partner: "partners",
  };
  return (Array.isArray(results) ? results : []).flatMap((item) => {
    const kind = item.kind || item.type,
      route = routes[kind];
    if (!route || !catalog[route].some((row) => row.id === item.id)) return [];
    return [
      { ...item, kind, href: `#${route}/${encodeURIComponent(item.id)}` },
    ];
  });
}
