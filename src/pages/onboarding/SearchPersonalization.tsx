/**
 * 3-step onboarding to seed personalization bias vector.
 * Routed at /onboarding/search.
 *   Step 1: pick 3 vibes
 *   Step 2: pick home city (autocomplete)
 *   Step 3: pick languages
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { submitOnboarding, fetchAutocomplete } from "@/lib/searchClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const VIBES = [
	"cruisy",
	"artsy",
	"mixed",
	"leather",
	"family-friendly",
	"sober",
	"kink",
	"drag",
	"intellectual",
	"queer-femme",
	"trans-friendly",
	"alternative",
	"cozy",
	"dance-floor",
];

const LANGS: { code: string; label: string }[] = [
	{ code: "en", label: "English" },
	{ code: "de", label: "Deutsch" },
	{ code: "es", label: "Español" },
	{ code: "fr", label: "Français" },
];

export default function SearchPersonalization() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [step, setStep] = useState(1);
	const [vibes, setVibes] = useState<string[]>([]);
	const [cityQuery, setCityQuery] = useState("");
	const [cityChoice, setCityChoice] = useState<{ id: string; title: string } | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
	const browserLang = useMemo(() => (typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en"), []);
	const [langs, setLangs] = useState<string[]>([browserLang in { en: 1, de: 1, es: 1, fr: 1 } ? browserLang : "en"]);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (cityQuery.length < 2) {
			setCitySuggestions([]);
			return;
		}
		const t = setTimeout(() => {
			fetchAutocomplete(cityQuery, ["cities"], 5).then(setCitySuggestions).catch(() => setCitySuggestions([]));
		}, 200);
		return () => clearTimeout(t);
	}, [cityQuery]);

	const toggleVibe = (v: string) =>
		setVibes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length < 5 ? [...cur, v] : cur));
	const toggleLang = (l: string) =>
		setLangs((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

	const submit = async () => {
		if (!user) {
			navigate("/auth");
			return;
		}
		setSubmitting(true);
		try {
			await submitOnboarding(user.id, {
				vibes,
				home_city: cityChoice?.title,
				languages: langs,
			});
			navigate("/");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="container max-w-xl py-8">
			<Card>
				<CardHeader>
					<CardTitle>Personalize your search</CardTitle>
					<p className="text-sm text-muted-foreground">Step {step} of 3</p>
				</CardHeader>
				<CardContent className="space-y-6">
					{step === 1 && (
						<div className="space-y-4">
							<p>Pick up to 5 vibes that describe what you usually look for.</p>
							<div className="flex flex-wrap gap-2">
								{VIBES.map((v) => (
									<Badge
										key={v}
										variant={vibes.includes(v) ? "default" : "outline"}
										className="cursor-pointer text-sm py-1.5 px-3"
										onClick={() => toggleVibe(v)}
									>
										{v}
									</Badge>
								))}
							</div>
							<div className="flex justify-end">
								<Button onClick={() => setStep(2)} disabled={vibes.length === 0}>
									Next
								</Button>
							</div>
						</div>
					)}

					{step === 2 && (
						<div className="space-y-4">
							<p>What's your home city?</p>
							<Input
								placeholder="Berlin, Madrid, ..."
								value={cityQuery}
								onChange={(e) => {
									setCityQuery(e.target.value);
									setCityChoice(null);
								}}
							/>
							{citySuggestions.length > 0 && !cityChoice && (
								<div className="border rounded-element divide-y">
									{citySuggestions.map((c) => (
										<button
											key={c.id}
											className="block w-full text-left px-3 py-2 hover:bg-muted"
											onClick={() => {
												setCityChoice({ id: c.id, title: c.title });
												setCityQuery(c.title);
											}}
										>
											{c.title} {c.country ? <span className="text-muted-foreground">— {c.country}</span> : null}
										</button>
									))}
								</div>
							)}
							<div className="flex justify-between">
								<Button variant="outline" onClick={() => setStep(1)}>
									Back
								</Button>
								<Button onClick={() => setStep(3)}>Next</Button>
							</div>
						</div>
					)}

					{step === 3 && (
						<div className="space-y-4">
							<p>What languages should we search in?</p>
							<div className="flex flex-wrap gap-2">
								{LANGS.map((l) => (
									<Badge
										key={l.code}
										variant={langs.includes(l.code) ? "default" : "outline"}
										className="cursor-pointer text-sm py-1.5 px-3"
										onClick={() => toggleLang(l.code)}
									>
										{l.label}
									</Badge>
								))}
							</div>
							<div className="flex justify-between">
								<Button variant="outline" onClick={() => setStep(2)}>
									Back
								</Button>
								<Button onClick={submit} disabled={submitting || langs.length === 0}>
									{submitting ? "Saving…" : "Finish"}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
