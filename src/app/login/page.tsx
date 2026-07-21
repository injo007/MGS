"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid email or password. Please try again.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-primary via-primary/90 to-primary/70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 h-64 w-64 rounded-full border border-white/20" />
          <div className="absolute top-40 left-40 h-48 w-48 rounded-full border border-white/15" />
          <div className="absolute bottom-20 right-20 h-80 w-80 rounded-full border border-white/20" />
          <div className="absolute bottom-40 right-40 h-56 w-56 rounded-full border border-white/15" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full border border-white/10" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm">
              <Cloud className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">CloudOps CRM</h1>
              <p className="text-sm text-white/70">Operations Platform</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Manage your VPS
            <br />
            & cloud infrastructure
            <br />
            <span className="text-white/70">with precision.</span>
          </h2>
          <p className="text-lg text-white/60 max-w-md leading-relaxed">
            Centralized operations CRM for provider management, server tracking,
            outreach, and server statistics.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            <div>
              <p className="text-3xl font-bold">1,200+</p>
              <p className="text-sm text-white/50 mt-1">Providers</p>
            </div>
            <div>
              <p className="text-3xl font-bold">850+</p>
              <p className="text-sm text-white/50 mt-1">Servers</p>
            </div>
            <div>
              <p className="text-3xl font-bold">12M+</p>
              <p className="text-sm text-white/50 mt-1">Daily Stats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
              <Cloud className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">CloudOps CRM</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@cloudops.com"
                autoComplete="email"
                disabled={isLoading}
                {...form.register("email")}
                className="h-10"
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...form.register("password")}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-8">
            CloudOps CRM &mdash; VPS & Cloud Provider Operations Platform
          </p>
        </div>
      </div>
    </div>
  );
}
