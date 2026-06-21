// =====================================================================
//  supabaseClient.js
//  Connexion au projet Supabase du Simulateur de performance CHR.
//
//  La cle "anon" est PUBLIQUE par conception : elle est protegee par la
//  securite RLS activee sur les tables. Elle peut figurer dans le code
//  livre au navigateur sans risque (elle y serait de toute facon).
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hjhjkmumsbrkhpodkazd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqaGprbXVtc2Jya2hwb2RrYXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODUzMjUsImV4cCI6MjA5NzU2MTMyNX0.DS0qnm0QiKwGydvgLgOdPSRx4p7M1oO7kVb8Xgay3TM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
