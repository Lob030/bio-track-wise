import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => { if (user) navigate({ to: "/" }); }, [user, navigate]);

  const signIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/" });
  };
  const signUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cuenta creada. Verifica tu email.");
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(String(r.error));
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.72_0.17_158/0.15),transparent_60%),radial-gradient(circle_at_70%_80%,oklch(0.70_0.16_280/0.10),transparent_60%)]" />
      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-emerald grid place-items-center text-primary-foreground font-bold text-xl mr-3">B</div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BioTrack</h1>
            <p className="text-xs text-muted-foreground">Gestión profesional de bioterio</p>
          </div>
        </div>
        <Card className="p-6 border-border bg-card/80 backdrop-blur">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 mb-5 w-full">
              <TabsTrigger value="signin">Iniciar sesión</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Contraseña</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <Button className="w-full" onClick={signIn} disabled={loading}>Entrar</Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Contraseña</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <Button className="w-full" onClick={signUp} disabled={loading}>Crear cuenta</Button>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>
            Continuar con Google
          </Button>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Empieza gratis en el plan Bronze. Actualiza cuando lo necesites.
        </p>
      </div>
    </div>
  );
}
