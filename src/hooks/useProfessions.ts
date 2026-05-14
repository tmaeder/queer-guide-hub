import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"

export function useProfessions() {
    const [professions, setProfessions] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

  useEffect(() => {
        const fetchProfessions = async () => {
                setLoading(true)
                try {
                          const { data, error } = await supabase
                            .from("professions" as never)
                            .select("name" as never)
                            .eq("is_active" as never, true as never)
                            .order("sort_order" as never, { ascending: true })
                          if (error) throw error
                          setProfessions((data as { name: string }[]).map((r) => r.name))
                } catch (err) {
                          console.error("Error fetching professions:", err)
                } finally {
                          setLoading(false)
                }
        }
        fetchProfessions()
  }, [])

  return { professions, loading }
}
