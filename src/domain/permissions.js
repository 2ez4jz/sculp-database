// Demo visibility only. Production authorization must use Auth + server-side RLS.
export const canViewBusiness = ({ role }) => role === "admin";
export const canViewTechnical = (context) =>
  canViewBusiness(context) && context.adminPersona === "jz";
export const visibleBookings = (bookings, context) =>
  canViewBusiness(context)
    ? bookings
    : bookings.filter((booking) =>
        booking.artistIds.includes(context.artistId),
      );
