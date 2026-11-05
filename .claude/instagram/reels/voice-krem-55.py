# Озвучка Reels голосом Silero v4_ru «xenia»: одна реплика на кадр сценария.
# Пишет line_XX.wav, voice.wav (склейка с паузами) и ../timings.json для render.js.
import json, os, sys, wave
import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
LINES = [
    "Коржи — триста девяносто семь рублей. Весь торт — тысяча четыреста двадцать два.",
    "Если считаете цену по муке и яйцам — теряете больше половины.",
    "Смотрите. Бисквит, двадцать четыре сантиметра, три коржа.",
    "Мука, сахар, яйца, масло — триста девяносто семь рублей.",
    "Ягодная начинка — ещё двести сорок.",
    "А теперь крем. Сыр, сливки, пудра — семьсот восемьдесят шесть.",
    "Это пятьдесят пять процентов всего торта.",
    "Один только сыр — пятьсот шестьдесят четыре рубля. Дороже всех коржей.",
    "Калькулятор сам добавляет крем — по ценам четырёх сетей.",
    "Бесплатно. Ссылка в шапке профиля.",
    "Сохраните — и считайте весь торт, а не только коржи.",
]
LEAD, GAP, TAIL = 0.25, 0.35, 1.2   # тишина в начале, между репликами, в конце (с)

torch.set_num_threads(4)
model = torch.package.PackageImporter(os.path.join(HERE, "v4_ru.pt")).load_pickle("tts_models", "model")
model.to(torch.device("cpu"))

parts, starts, t = [np.zeros(int(LEAD * SR), np.float32)], [], LEAD
for i, text in enumerate(LINES):
    audio = model.apply_tts(text=text, speaker="xenia", sample_rate=SR, put_accent=True, put_yo=True).numpy()
    starts.append(round(t - (LEAD if i == 0 else 0.15), 3))   # кадр меняется чуть раньше голоса
    parts += [audio, np.zeros(int(GAP * SR), np.float32)]
    t += len(audio) / SR + GAP
    print(f"{i+1:2d}  {len(audio)/SR:4.2f}s  {text}", flush=True)
starts[0] = 0.0
parts.append(np.zeros(int(TAIL * SR), np.float32))
full = np.concatenate(parts)
pcm = (np.clip(full / max(1e-6, np.abs(full).max()) * 0.89, -1, 1) * 32767).astype("<i2")
with wave.open(os.path.join(HERE, "voice.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
total = round(len(full) / SR, 3)
json.dump({"starts": starts, "total": total}, open(os.path.join(HERE, "..", "timings.json"), "w"))
print("total", total, "starts", starts)
