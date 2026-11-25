// Storefront settings. Everything here is public by design — the anon key only
// allows reading the active catalog (row-level security enforces that).
// Clear supabaseUrl to run the page in demo mode with a sample catalog.
window.SHOP_CONFIG = {
  supabaseUrl: "https://wbfqhrhanhevdlnspezy.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZnFocmhhbmhldmRsbnNwZXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTQwMzIsImV4cCI6MjEwNjE5MDAzMn0.nKDJ1Tu2TKN0-OALnNpMUSyq8J3vv5n-fOXgGERG65g", // anon key: read-only catalog access, safe to publish

  brand: "LucidSoup Drops",
  tagline: "",              // replaces the line under the headline
  legalName: "",            // your registered business name, shown in the policies
  contactEmail: "",         // where customers write to you
  refundDays: 14,           // window for "it doesn't work" refunds
};
