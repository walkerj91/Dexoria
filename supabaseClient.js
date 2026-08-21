import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://uygnyhljorjpmwlnbkyp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5Z255aGxqb3JqcG13bG5ia3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjQyMzQsImV4cCI6MjA5MzE0MDIzNH0.dkCA3Rk5n1t5CN9b6-Hu80h6Z5IVsvIrN-Wk-PmqA0w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    storage: window.sessionStorage
  }
});
