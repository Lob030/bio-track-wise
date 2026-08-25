import { useTheme } from "@/hooks/use-theme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeId } from "@/lib/themes";

export function ThemeSelector() {
  const { currentTheme, setTheme, allThemes, isLoading } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold mb-3 block">Tema de la aplicación</label>
        <Select value={currentTheme} onValueChange={(val) => setTheme(val as ThemeId)} disabled={isLoading}>
          <SelectTrigger className="w-full bg-slate-900 border-slate-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allThemes.map((theme) => (
              <SelectItem key={theme.id} value={theme.id}>
                <span>{theme.icon} {theme.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Theme preview grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
        {allThemes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => setTheme(theme.id)}
            disabled={isLoading}
            className="text-left transition-all focus:outline-none"
            type="button"
          >
            <Card className={`p-4 cursor-pointer hover:ring-2 hover:ring-emerald-glow/40 ${
              currentTheme === theme.id ? "ring-2 ring-emerald-glow" : ""
            }`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-sm">{theme.icon} {theme.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
                </div>
                {currentTheme === theme.id && (
                  <Badge variant="default" className="ml-2 bg-emerald-glow text-slate-950 font-medium">Activo</Badge>
                )}
              </div>
              <div className="flex gap-2.5 mt-3 pt-2.5 border-t border-slate-800/40">
                {Object.entries(theme.colors)
                  .slice(0, 5)
                  .map(([name, color]) => (
                    <div
                      key={name}
                      className="w-5 h-5 rounded-sm border border-slate-800"
                      style={{ 
                        backgroundColor: color,
                      }}
                      title={name}
                    />
                  ))}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
