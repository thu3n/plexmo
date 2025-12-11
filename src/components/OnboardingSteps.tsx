"use client";

import { useLanguage } from "@/components/LanguageContext";

type StepProps = {
    currentStep: number;
};

export function OnboardingSteps({ currentStep }: StepProps) {
    const { t } = useLanguage();

    const steps = [
        { id: 1, label: t("onboarding.steps.signin") || "Sign in with Plex" },
        { id: 2, label: t("onboarding.steps.configure") || "Configure Plex" },
        //{ id: 3, label: "Configure Services" }, // Reserved for future
    ];

    return (
        <div className="w-full max-w-lg mx-auto mb-10">
            <div className="relative flex justify-between px-10">
                {/* Connecting Line */}
                <div className="absolute top-1/2 left-10 right-10 h-1 -translate-y-1/2 bg-white/10 rounded-full -z-10" />

                {steps.map((step) => {
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 bg-slate-950 px-4">
                            <div
                                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${isActive
                                    ? "border-amber-500 bg-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.5)]"
                                    : isCompleted
                                        ? "border-amber-500/50 bg-amber-500/20 text-amber-500"
                                        : "border-white/10 bg-slate-900 text-white/30"
                                    }`}
                            >
                                {isCompleted ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                ) : (
                                    <span className="font-bold">{step.id}</span>
                                )}
                            </div>
                            <span className={`text-sm font-medium transition-colors duration-300 ${isActive ? "text-white" : isCompleted ? "text-white/70" : "text-white/30"}`}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
