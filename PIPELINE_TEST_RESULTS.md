# Pipeline test results — full inbox run

_Last run: 2026-09-20 13:07:36 (local)_

Run of `python pipeline.py` against all **520 emails / 250 attachments** in `sdoc-hackathon-bundle/inbox` + `sdoc-hackathon-bundle/attachments`, using the current `pipeline.py` (post Tier-1 `missing_attachment`/`missing_value` fixes). No model-provider API keys were set in this environment, so every email was classified via the deterministic `classify_keywords` fallback (no LLM calls made, no cache warmed — that step still needs to be run by whoever holds the API keys, see the note at the end).

## Summary

### Category breakdown (all 520 emails)

| Category | Count | % of inbox |
|---|---|---|
| BL_COMPARISON | 220 | 42.3% |
| SI_REQUEST | 125 | 24.0% |
| INVOICE_QUERY | 75 | 14.4% |
| GENERAL | 60 | 11.5% |
| SPAM | 40 | 7.7% |
| **Total** | **520** | 100% |

### BL_COMPARISON outcome (of 220 comparison emails — `status` is only meaningful for this category; other categories always report `OK`)

| Status | Count |
|---|---|
| OK | 146 |
| MISMATCH | 36 |
| NEEDS_REVIEW | 38 |
| **Total** | **220** |

### NEEDS_REVIEW reasons

| Reason | Count |
|---|---|
| wrong_doc_type | 5 |
| missing_attachment | 5 |
| unreadable | 5 |
| missing_value | 23 |
| **Total** | **38** |

### Defect fields (across all MISMATCH emails)

| Field | Count |
|---|---|
| container_count | 13 |
| port_of_discharge | 12 |
| notify_party | 7 |
| shipper | 7 |
| gross_weight_kg | 6 |
| port_of_loading | 6 |
| consignee | 5 |

## Edge-case verification (email_501–email_520)

These 20 emails are the dataset's dedicated edge cases (5 each for `wrong_doc_type`, `missing_attachment`, `unreadable`, `missing_value`) and are what the Tier-1 fixes in `pipeline.py` targeted. All 20 now resolve to the expected `NEEDS_REVIEW` reason (**20/20** — previously 15/20 before the fixes: `missing_attachment` caught 2/5, `missing_value` caught 3/5).

| Email ID | Category | Status | Review reason |
|---|---|---|---|
| email_501 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |
| email_502 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |
| email_503 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |
| email_504 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |
| email_505 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |
| email_506 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |
| email_507 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |
| email_508 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |
| email_509 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |
| email_510 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |
| email_511 | BL_COMPARISON | NEEDS_REVIEW | unreadable |
| email_512 | BL_COMPARISON | NEEDS_REVIEW | unreadable |
| email_513 | BL_COMPARISON | NEEDS_REVIEW | unreadable |
| email_514 | BL_COMPARISON | NEEDS_REVIEW | unreadable |
| email_515 | BL_COMPARISON | NEEDS_REVIEW | unreadable |
| email_516 | BL_COMPARISON | NEEDS_REVIEW | missing_value |
| email_517 | BL_COMPARISON | NEEDS_REVIEW | missing_value |
| email_518 | BL_COMPARISON | NEEDS_REVIEW | missing_value |
| email_519 | BL_COMPARISON | NEEDS_REVIEW | missing_value |
| email_520 | BL_COMPARISON | NEEDS_REVIEW | missing_value |

## Full results — all 520 emails

| Email ID | Category | Status | Review reason | Defect fields |
|---|---|---|---|---|
| email_001 | BL_COMPARISON | OK |  |  |
| email_002 | INVOICE_QUERY | OK |  |  |
| email_003 | BL_COMPARISON | OK |  |  |
| email_004 | BL_COMPARISON | MISMATCH |  | consignee, notify_party |
| email_005 | BL_COMPARISON | OK |  |  |
| email_006 | BL_COMPARISON | OK |  |  |
| email_007 | SI_REQUEST | OK |  |  |
| email_008 | SI_REQUEST | OK |  |  |
| email_009 | BL_COMPARISON | OK |  |  |
| email_010 | INVOICE_QUERY | OK |  |  |
| email_011 | GENERAL | OK |  |  |
| email_012 | GENERAL | OK |  |  |
| email_013 | BL_COMPARISON | MISMATCH |  | port_of_discharge |
| email_014 | SI_REQUEST | OK |  |  |
| email_015 | SPAM | OK |  |  |
| email_016 | BL_COMPARISON | OK |  |  |
| email_017 | INVOICE_QUERY | OK |  |  |
| email_018 | BL_COMPARISON | OK |  |  |
| email_019 | SI_REQUEST | OK |  |  |
| email_020 | SI_REQUEST | OK |  |  |
| email_021 | GENERAL | OK |  |  |
| email_022 | SI_REQUEST | OK |  |  |
| email_023 | SI_REQUEST | OK |  |  |
| email_024 | INVOICE_QUERY | OK |  |  |
| email_025 | BL_COMPARISON | MISMATCH |  | port_of_discharge, container_count |
| email_026 | SPAM | OK |  |  |
| email_027 | SI_REQUEST | OK |  |  |
| email_028 | SI_REQUEST | OK |  |  |
| email_029 | SI_REQUEST | OK |  |  |
| email_030 | SI_REQUEST | OK |  |  |
| email_031 | BL_COMPARISON | MISMATCH |  | container_count, gross_weight_kg |
| email_032 | BL_COMPARISON | OK |  |  |
| email_033 | SI_REQUEST | OK |  |  |
| email_034 | BL_COMPARISON | OK |  |  |
| email_035 | SI_REQUEST | OK |  |  |
| email_036 | BL_COMPARISON | OK |  |  |
| email_037 | GENERAL | OK |  |  |
| email_038 | BL_COMPARISON | OK |  |  |
| email_039 | SI_REQUEST | OK |  |  |
| email_040 | BL_COMPARISON | OK |  |  |
| email_041 | INVOICE_QUERY | OK |  |  |
| email_042 | SI_REQUEST | OK |  |  |
| email_043 | BL_COMPARISON | MISMATCH |  | container_count |
| email_044 | BL_COMPARISON | OK |  |  |
| email_045 | INVOICE_QUERY | OK |  |  |
| email_046 | BL_COMPARISON | MISMATCH |  | notify_party |
| email_047 | BL_COMPARISON | OK |  |  |
| email_048 | INVOICE_QUERY | OK |  |  |
| email_049 | BL_COMPARISON | OK |  |  |
| email_050 | BL_COMPARISON | OK |  |  |
| email_051 | BL_COMPARISON | OK |  |  |
| email_052 | BL_COMPARISON | OK |  |  |
| email_053 | GENERAL | OK |  |  |
| email_054 | SI_REQUEST | OK |  |  |
| email_055 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_056 | BL_COMPARISON | OK |  |  |
| email_057 | SI_REQUEST | OK |  |  |
| email_058 | BL_COMPARISON | OK |  |  |
| email_059 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_060 | INVOICE_QUERY | OK |  |  |
| email_061 | BL_COMPARISON | OK |  |  |
| email_062 | INVOICE_QUERY | OK |  |  |
| email_063 | BL_COMPARISON | OK |  |  |
| email_064 | BL_COMPARISON | OK |  |  |
| email_065 | BL_COMPARISON | MISMATCH |  | notify_party, port_of_discharge |
| email_066 | BL_COMPARISON | OK |  |  |
| email_067 | SI_REQUEST | OK |  |  |
| email_068 | BL_COMPARISON | OK |  |  |
| email_069 | INVOICE_QUERY | OK |  |  |
| email_070 | GENERAL | OK |  |  |
| email_071 | BL_COMPARISON | MISMATCH |  | port_of_discharge, container_count |
| email_072 | SPAM | OK |  |  |
| email_073 | SI_REQUEST | OK |  |  |
| email_074 | INVOICE_QUERY | OK |  |  |
| email_075 | GENERAL | OK |  |  |
| email_076 | GENERAL | OK |  |  |
| email_077 | BL_COMPARISON | OK |  |  |
| email_078 | INVOICE_QUERY | OK |  |  |
| email_079 | SI_REQUEST | OK |  |  |
| email_080 | BL_COMPARISON | OK |  |  |
| email_081 | BL_COMPARISON | OK |  |  |
| email_082 | BL_COMPARISON | OK |  |  |
| email_083 | GENERAL | OK |  |  |
| email_084 | SI_REQUEST | OK |  |  |
| email_085 | INVOICE_QUERY | OK |  |  |
| email_086 | GENERAL | OK |  |  |
| email_087 | INVOICE_QUERY | OK |  |  |
| email_088 | BL_COMPARISON | OK |  |  |
| email_089 | GENERAL | OK |  |  |
| email_090 | BL_COMPARISON | OK |  |  |
| email_091 | BL_COMPARISON | MISMATCH |  | container_count |
| email_092 | BL_COMPARISON | OK |  |  |
| email_093 | SI_REQUEST | OK |  |  |
| email_094 | SI_REQUEST | OK |  |  |
| email_095 | BL_COMPARISON | OK |  |  |
| email_096 | BL_COMPARISON | OK |  |  |
| email_097 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_098 | GENERAL | OK |  |  |
| email_099 | INVOICE_QUERY | OK |  |  |
| email_100 | BL_COMPARISON | OK |  |  |
| email_101 | SI_REQUEST | OK |  |  |
| email_102 | INVOICE_QUERY | OK |  |  |
| email_103 | SI_REQUEST | OK |  |  |
| email_104 | INVOICE_QUERY | OK |  |  |
| email_105 | BL_COMPARISON | OK |  |  |
| email_106 | SI_REQUEST | OK |  |  |
| email_107 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_108 | INVOICE_QUERY | OK |  |  |
| email_109 | BL_COMPARISON | OK |  |  |
| email_110 | SI_REQUEST | OK |  |  |
| email_111 | BL_COMPARISON | MISMATCH |  | container_count |
| email_112 | INVOICE_QUERY | OK |  |  |
| email_113 | BL_COMPARISON | OK |  |  |
| email_114 | BL_COMPARISON | OK |  |  |
| email_115 | INVOICE_QUERY | OK |  |  |
| email_116 | SPAM | OK |  |  |
| email_117 | GENERAL | OK |  |  |
| email_118 | BL_COMPARISON | OK |  |  |
| email_119 | BL_COMPARISON | MISMATCH |  | port_of_loading |
| email_120 | SI_REQUEST | OK |  |  |
| email_121 | BL_COMPARISON | MISMATCH |  | gross_weight_kg |
| email_122 | SI_REQUEST | OK |  |  |
| email_123 | SPAM | OK |  |  |
| email_124 | SI_REQUEST | OK |  |  |
| email_125 | SI_REQUEST | OK |  |  |
| email_126 | GENERAL | OK |  |  |
| email_127 | SI_REQUEST | OK |  |  |
| email_128 | BL_COMPARISON | MISMATCH |  | port_of_loading, gross_weight_kg |
| email_129 | BL_COMPARISON | MISMATCH |  | port_of_loading, port_of_discharge |
| email_130 | SI_REQUEST | OK |  |  |
| email_131 | SI_REQUEST | OK |  |  |
| email_132 | BL_COMPARISON | OK |  |  |
| email_133 | BL_COMPARISON | MISMATCH |  | gross_weight_kg |
| email_134 | SPAM | OK |  |  |
| email_135 | SI_REQUEST | OK |  |  |
| email_136 | BL_COMPARISON | OK |  |  |
| email_137 | SI_REQUEST | OK |  |  |
| email_138 | SI_REQUEST | OK |  |  |
| email_139 | INVOICE_QUERY | OK |  |  |
| email_140 | SPAM | OK |  |  |
| email_141 | BL_COMPARISON | OK |  |  |
| email_142 | GENERAL | OK |  |  |
| email_143 | BL_COMPARISON | OK |  |  |
| email_144 | BL_COMPARISON | MISMATCH |  | consignee, container_count |
| email_145 | BL_COMPARISON | MISMATCH |  | shipper |
| email_146 | BL_COMPARISON | OK |  |  |
| email_147 | GENERAL | OK |  |  |
| email_148 | SI_REQUEST | OK |  |  |
| email_149 | SI_REQUEST | OK |  |  |
| email_150 | SPAM | OK |  |  |
| email_151 | SI_REQUEST | OK |  |  |
| email_152 | BL_COMPARISON | OK |  |  |
| email_153 | GENERAL | OK |  |  |
| email_154 | SI_REQUEST | OK |  |  |
| email_155 | INVOICE_QUERY | OK |  |  |
| email_156 | SPAM | OK |  |  |
| email_157 | SI_REQUEST | OK |  |  |
| email_158 | BL_COMPARISON | OK |  |  |
| email_159 | GENERAL | OK |  |  |
| email_160 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_161 | BL_COMPARISON | OK |  |  |
| email_162 | SI_REQUEST | OK |  |  |
| email_163 | SI_REQUEST | OK |  |  |
| email_164 | SI_REQUEST | OK |  |  |
| email_165 | INVOICE_QUERY | OK |  |  |
| email_166 | SI_REQUEST | OK |  |  |
| email_167 | BL_COMPARISON | OK |  |  |
| email_168 | SI_REQUEST | OK |  |  |
| email_169 | INVOICE_QUERY | OK |  |  |
| email_170 | INVOICE_QUERY | OK |  |  |
| email_171 | BL_COMPARISON | OK |  |  |
| email_172 | SI_REQUEST | OK |  |  |
| email_173 | GENERAL | OK |  |  |
| email_174 | BL_COMPARISON | MISMATCH |  | notify_party, port_of_discharge |
| email_175 | BL_COMPARISON | OK |  |  |
| email_176 | BL_COMPARISON | OK |  |  |
| email_177 | SI_REQUEST | OK |  |  |
| email_178 | BL_COMPARISON | MISMATCH |  | container_count |
| email_179 | INVOICE_QUERY | OK |  |  |
| email_180 | SPAM | OK |  |  |
| email_181 | SI_REQUEST | OK |  |  |
| email_182 | BL_COMPARISON | MISMATCH |  | port_of_discharge, container_count |
| email_183 | SI_REQUEST | OK |  |  |
| email_184 | SPAM | OK |  |  |
| email_185 | GENERAL | OK |  |  |
| email_186 | BL_COMPARISON | OK |  |  |
| email_187 | BL_COMPARISON | OK |  |  |
| email_188 | SPAM | OK |  |  |
| email_189 | BL_COMPARISON | OK |  |  |
| email_190 | BL_COMPARISON | OK |  |  |
| email_191 | INVOICE_QUERY | OK |  |  |
| email_192 | SI_REQUEST | OK |  |  |
| email_193 | SI_REQUEST | OK |  |  |
| email_194 | GENERAL | OK |  |  |
| email_195 | BL_COMPARISON | OK |  |  |
| email_196 | SI_REQUEST | OK |  |  |
| email_197 | BL_COMPARISON | OK |  |  |
| email_198 | BL_COMPARISON | OK |  |  |
| email_199 | BL_COMPARISON | OK |  |  |
| email_200 | GENERAL | OK |  |  |
| email_201 | SI_REQUEST | OK |  |  |
| email_202 | SI_REQUEST | OK |  |  |
| email_203 | INVOICE_QUERY | OK |  |  |
| email_204 | SPAM | OK |  |  |
| email_205 | SI_REQUEST | OK |  |  |
| email_206 | SPAM | OK |  |  |
| email_207 | BL_COMPARISON | OK |  |  |
| email_208 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_209 | SI_REQUEST | OK |  |  |
| email_210 | BL_COMPARISON | OK |  |  |
| email_211 | INVOICE_QUERY | OK |  |  |
| email_212 | INVOICE_QUERY | OK |  |  |
| email_213 | GENERAL | OK |  |  |
| email_214 | SI_REQUEST | OK |  |  |
| email_215 | SPAM | OK |  |  |
| email_216 | INVOICE_QUERY | OK |  |  |
| email_217 | SI_REQUEST | OK |  |  |
| email_218 | GENERAL | OK |  |  |
| email_219 | GENERAL | OK |  |  |
| email_220 | BL_COMPARISON | OK |  |  |
| email_221 | SI_REQUEST | OK |  |  |
| email_222 | SPAM | OK |  |  |
| email_223 | BL_COMPARISON | OK |  |  |
| email_224 | INVOICE_QUERY | OK |  |  |
| email_225 | BL_COMPARISON | MISMATCH |  | consignee |
| email_226 | SPAM | OK |  |  |
| email_227 | BL_COMPARISON | OK |  |  |
| email_228 | SI_REQUEST | OK |  |  |
| email_229 | BL_COMPARISON | OK |  |  |
| email_230 | GENERAL | OK |  |  |
| email_231 | SPAM | OK |  |  |
| email_232 | GENERAL | OK |  |  |
| email_233 | SI_REQUEST | OK |  |  |
| email_234 | GENERAL | OK |  |  |
| email_235 | BL_COMPARISON | OK |  |  |
| email_236 | INVOICE_QUERY | OK |  |  |
| email_237 | BL_COMPARISON | OK |  |  |
| email_238 | GENERAL | OK |  |  |
| email_239 | BL_COMPARISON | OK |  |  |
| email_240 | SI_REQUEST | OK |  |  |
| email_241 | GENERAL | OK |  |  |
| email_242 | BL_COMPARISON | OK |  |  |
| email_243 | BL_COMPARISON | MISMATCH |  | port_of_loading, port_of_discharge |
| email_244 | SI_REQUEST | OK |  |  |
| email_245 | SI_REQUEST | OK |  |  |
| email_246 | SI_REQUEST | OK |  |  |
| email_247 | BL_COMPARISON | OK |  |  |
| email_248 | SPAM | OK |  |  |
| email_249 | BL_COMPARISON | OK |  |  |
| email_250 | BL_COMPARISON | OK |  |  |
| email_251 | SI_REQUEST | OK |  |  |
| email_252 | GENERAL | OK |  |  |
| email_253 | SPAM | OK |  |  |
| email_254 | SPAM | OK |  |  |
| email_255 | GENERAL | OK |  |  |
| email_256 | BL_COMPARISON | MISMATCH |  | shipper, port_of_discharge |
| email_257 | SI_REQUEST | OK |  |  |
| email_258 | GENERAL | OK |  |  |
| email_259 | BL_COMPARISON | OK |  |  |
| email_260 | SI_REQUEST | OK |  |  |
| email_261 | BL_COMPARISON | OK |  |  |
| email_262 | INVOICE_QUERY | OK |  |  |
| email_263 | BL_COMPARISON | OK |  |  |
| email_264 | SI_REQUEST | OK |  |  |
| email_265 | BL_COMPARISON | OK |  |  |
| email_266 | GENERAL | OK |  |  |
| email_267 | SPAM | OK |  |  |
| email_268 | INVOICE_QUERY | OK |  |  |
| email_269 | INVOICE_QUERY | OK |  |  |
| email_270 | BL_COMPARISON | MISMATCH |  | port_of_discharge |
| email_271 | BL_COMPARISON | OK |  |  |
| email_272 | INVOICE_QUERY | OK |  |  |
| email_273 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_274 | INVOICE_QUERY | OK |  |  |
| email_275 | BL_COMPARISON | OK |  |  |
| email_276 | SI_REQUEST | OK |  |  |
| email_277 | SI_REQUEST | OK |  |  |
| email_278 | SI_REQUEST | OK |  |  |
| email_279 | SI_REQUEST | OK |  |  |
| email_280 | INVOICE_QUERY | OK |  |  |
| email_281 | BL_COMPARISON | OK |  |  |
| email_282 | BL_COMPARISON | OK |  |  |
| email_283 | SI_REQUEST | OK |  |  |
| email_284 | INVOICE_QUERY | OK |  |  |
| email_285 | INVOICE_QUERY | OK |  |  |
| email_286 | INVOICE_QUERY | OK |  |  |
| email_287 | INVOICE_QUERY | OK |  |  |
| email_288 | BL_COMPARISON | OK |  |  |
| email_289 | SI_REQUEST | OK |  |  |
| email_290 | SI_REQUEST | OK |  |  |
| email_291 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_292 | BL_COMPARISON | OK |  |  |
| email_293 | SI_REQUEST | OK |  |  |
| email_294 | GENERAL | OK |  |  |
| email_295 | SI_REQUEST | OK |  |  |
| email_296 | BL_COMPARISON | OK |  |  |
| email_297 | GENERAL | OK |  |  |
| email_298 | INVOICE_QUERY | OK |  |  |
| email_299 | BL_COMPARISON | OK |  |  |
| email_300 | BL_COMPARISON | MISMATCH |  | shipper, notify_party |
| email_301 | BL_COMPARISON | OK |  |  |
| email_302 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_303 | INVOICE_QUERY | OK |  |  |
| email_304 | INVOICE_QUERY | OK |  |  |
| email_305 | BL_COMPARISON | OK |  |  |
| email_306 | SI_REQUEST | OK |  |  |
| email_307 | BL_COMPARISON | OK |  |  |
| email_308 | SI_REQUEST | OK |  |  |
| email_309 | BL_COMPARISON | OK |  |  |
| email_310 | SI_REQUEST | OK |  |  |
| email_311 | SI_REQUEST | OK |  |  |
| email_312 | BL_COMPARISON | MISMATCH |  | shipper, notify_party |
| email_313 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_314 | INVOICE_QUERY | OK |  |  |
| email_315 | SPAM | OK |  |  |
| email_316 | INVOICE_QUERY | OK |  |  |
| email_317 | SI_REQUEST | OK |  |  |
| email_318 | BL_COMPARISON | OK |  |  |
| email_319 | BL_COMPARISON | OK |  |  |
| email_320 | SI_REQUEST | OK |  |  |
| email_321 | BL_COMPARISON | OK |  |  |
| email_322 | SI_REQUEST | OK |  |  |
| email_323 | GENERAL | OK |  |  |
| email_324 | BL_COMPARISON | MISMATCH |  | shipper, container_count |
| email_325 | GENERAL | OK |  |  |
| email_326 | BL_COMPARISON | OK |  |  |
| email_327 | SI_REQUEST | OK |  |  |
| email_328 | GENERAL | OK |  |  |
| email_329 | SPAM | OK |  |  |
| email_330 | GENERAL | OK |  |  |
| email_331 | INVOICE_QUERY | OK |  |  |
| email_332 | GENERAL | OK |  |  |
| email_333 | GENERAL | OK |  |  |
| email_334 | BL_COMPARISON | MISMATCH |  | shipper, consignee |
| email_335 | BL_COMPARISON | OK |  |  |
| email_336 | SI_REQUEST | OK |  |  |
| email_337 | BL_COMPARISON | OK |  |  |
| email_338 | SI_REQUEST | OK |  |  |
| email_339 | SI_REQUEST | OK |  |  |
| email_340 | GENERAL | OK |  |  |
| email_341 | BL_COMPARISON | OK |  |  |
| email_342 | BL_COMPARISON | MISMATCH |  | notify_party, container_count |
| email_343 | BL_COMPARISON | OK |  |  |
| email_344 | SI_REQUEST | OK |  |  |
| email_345 | SPAM | OK |  |  |
| email_346 | GENERAL | OK |  |  |
| email_347 | GENERAL | OK |  |  |
| email_348 | BL_COMPARISON | OK |  |  |
| email_349 | BL_COMPARISON | OK |  |  |
| email_350 | BL_COMPARISON | OK |  |  |
| email_351 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_352 | SI_REQUEST | OK |  |  |
| email_353 | SI_REQUEST | OK |  |  |
| email_354 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_355 | INVOICE_QUERY | OK |  |  |
| email_356 | GENERAL | OK |  |  |
| email_357 | SI_REQUEST | OK |  |  |
| email_358 | SI_REQUEST | OK |  |  |
| email_359 | SI_REQUEST | OK |  |  |
| email_360 | SI_REQUEST | OK |  |  |
| email_361 | BL_COMPARISON | MISMATCH |  | port_of_discharge, gross_weight_kg |
| email_362 | SI_REQUEST | OK |  |  |
| email_363 | SPAM | OK |  |  |
| email_364 | BL_COMPARISON | OK |  |  |
| email_365 | SPAM | OK |  |  |
| email_366 | GENERAL | OK |  |  |
| email_367 | BL_COMPARISON | OK |  |  |
| email_368 | SI_REQUEST | OK |  |  |
| email_369 | INVOICE_QUERY | OK |  |  |
| email_370 | SI_REQUEST | OK |  |  |
| email_371 | SI_REQUEST | OK |  |  |
| email_372 | INVOICE_QUERY | OK |  |  |
| email_373 | INVOICE_QUERY | OK |  |  |
| email_374 | INVOICE_QUERY | OK |  |  |
| email_375 | INVOICE_QUERY | OK |  |  |
| email_376 | SI_REQUEST | OK |  |  |
| email_377 | BL_COMPARISON | OK |  |  |
| email_378 | BL_COMPARISON | OK |  |  |
| email_379 | BL_COMPARISON | MISMATCH |  | shipper |
| email_380 | SI_REQUEST | OK |  |  |
| email_381 | BL_COMPARISON | OK |  |  |
| email_382 | SPAM | OK |  |  |
| email_383 | BL_COMPARISON | OK |  |  |
| email_384 | BL_COMPARISON | OK |  |  |
| email_385 | BL_COMPARISON | OK |  |  |
| email_386 | INVOICE_QUERY | OK |  |  |
| email_387 | SPAM | OK |  |  |
| email_388 | SI_REQUEST | OK |  |  |
| email_389 | INVOICE_QUERY | OK |  |  |
| email_390 | SPAM | OK |  |  |
| email_391 | BL_COMPARISON | OK |  |  |
| email_392 | SPAM | OK |  |  |
| email_393 | SI_REQUEST | OK |  |  |
| email_394 | GENERAL | OK |  |  |
| email_395 | SPAM | OK |  |  |
| email_396 | GENERAL | OK |  |  |
| email_397 | SI_REQUEST | OK |  |  |
| email_398 | BL_COMPARISON | OK |  |  |
| email_399 | GENERAL | OK |  |  |
| email_400 | SI_REQUEST | OK |  |  |
| email_401 | BL_COMPARISON | OK |  |  |
| email_402 | INVOICE_QUERY | OK |  |  |
| email_403 | INVOICE_QUERY | OK |  |  |
| email_404 | SPAM | OK |  |  |
| email_405 | BL_COMPARISON | OK |  |  |
| email_406 | INVOICE_QUERY | OK |  |  |
| email_407 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_408 | BL_COMPARISON | OK |  |  |
| email_409 | BL_COMPARISON | OK |  |  |
| email_410 | BL_COMPARISON | MISMATCH |  | port_of_loading |
| email_411 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_412 | INVOICE_QUERY | OK |  |  |
| email_413 | SI_REQUEST | OK |  |  |
| email_414 | GENERAL | OK |  |  |
| email_415 | GENERAL | OK |  |  |
| email_416 | BL_COMPARISON | MISMATCH |  | gross_weight_kg |
| email_417 | SPAM | OK |  |  |
| email_418 | GENERAL | OK |  |  |
| email_419 | BL_COMPARISON | OK |  |  |
| email_420 | INVOICE_QUERY | OK |  |  |
| email_421 | BL_COMPARISON | OK |  |  |
| email_422 | INVOICE_QUERY | OK |  |  |
| email_423 | BL_COMPARISON | OK |  |  |
| email_424 | BL_COMPARISON | OK |  |  |
| email_425 | INVOICE_QUERY | OK |  |  |
| email_426 | BL_COMPARISON | MISMATCH |  | port_of_discharge, container_count |
| email_427 | SI_REQUEST | OK |  |  |
| email_428 | BL_COMPARISON | OK |  |  |
| email_429 | SI_REQUEST | OK |  |  |
| email_430 | SI_REQUEST | OK |  |  |
| email_431 | GENERAL | OK |  |  |
| email_432 | BL_COMPARISON | OK |  |  |
| email_433 | SI_REQUEST | OK |  |  |
| email_434 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_435 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_436 | BL_COMPARISON | OK |  |  |
| email_437 | SI_REQUEST | OK |  |  |
| email_438 | SI_REQUEST | OK |  |  |
| email_439 | INVOICE_QUERY | OK |  |  |
| email_440 | BL_COMPARISON | OK |  |  |
| email_441 | GENERAL | OK |  |  |
| email_442 | BL_COMPARISON | OK |  |  |
| email_443 | SI_REQUEST | OK |  |  |
| email_444 | BL_COMPARISON | OK |  |  |
| email_445 | GENERAL | OK |  |  |
| email_446 | BL_COMPARISON | OK |  |  |
| email_447 | BL_COMPARISON | OK |  |  |
| email_448 | BL_COMPARISON | OK |  |  |
| email_449 | SPAM | OK |  |  |
| email_450 | SPAM | OK |  |  |
| email_451 | BL_COMPARISON | OK |  |  |
| email_452 | INVOICE_QUERY | OK |  |  |
| email_453 | BL_COMPARISON | OK |  |  |
| email_454 | BL_COMPARISON | OK |  |  |
| email_455 | SPAM | OK |  |  |
| email_456 | BL_COMPARISON | OK |  |  |
| email_457 | SPAM | OK |  |  |
| email_458 | INVOICE_QUERY | OK |  |  |
| email_459 | BL_COMPARISON | OK |  |  |
| email_460 | GENERAL | OK |  |  |
| email_461 | INVOICE_QUERY | OK |  |  |
| email_462 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_463 | GENERAL | OK |  |  |
| email_464 | GENERAL | OK |  |  |
| email_465 | BL_COMPARISON | OK |  |  |
| email_466 | SI_REQUEST | OK |  |  |
| email_467 | SI_REQUEST | OK |  |  |
| email_468 | BL_COMPARISON | MISMATCH |  | port_of_loading, container_count |
| email_469 | SI_REQUEST | OK |  |  |
| email_470 | SPAM | OK |  |  |
| email_471 | INVOICE_QUERY | OK |  |  |
| email_472 | INVOICE_QUERY | OK |  |  |
| email_473 | INVOICE_QUERY | OK |  |  |
| email_474 | BL_COMPARISON | OK |  |  |
| email_475 | SI_REQUEST | OK |  |  |
| email_476 | BL_COMPARISON | OK |  |  |
| email_477 | SI_REQUEST | OK |  |  |
| email_478 | SI_REQUEST | OK |  |  |
| email_479 | BL_COMPARISON | OK |  |  |
| email_480 | BL_COMPARISON | OK |  |  |
| email_481 | BL_COMPARISON | MISMATCH |  | consignee |
| email_482 | BL_COMPARISON | OK |  |  |
| email_483 | BL_COMPARISON | OK |  |  |
| email_484 | SI_REQUEST | OK |  |  |
| email_485 | SI_REQUEST | OK |  |  |
| email_486 | BL_COMPARISON | OK |  |  |
| email_487 | SI_REQUEST | OK |  |  |
| email_488 | GENERAL | OK |  |  |
| email_489 | SPAM | OK |  |  |
| email_490 | INVOICE_QUERY | OK |  |  |
| email_491 | BL_COMPARISON | OK |  |  |
| email_492 | INVOICE_QUERY | OK |  |  |
| email_493 | BL_COMPARISON | OK |  |  |
| email_494 | BL_COMPARISON | OK |  |  |
| email_495 | BL_COMPARISON | OK |  |  |
| email_496 | BL_COMPARISON | OK |  |  |
| email_497 | INVOICE_QUERY | OK |  |  |
| email_498 | BL_COMPARISON | OK |  |  |
| email_499 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_500 | INVOICE_QUERY | OK |  |  |
| email_501 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |  |
| email_502 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |  |
| email_503 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |  |
| email_504 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |  |
| email_505 | BL_COMPARISON | NEEDS_REVIEW | wrong_doc_type |  |
| email_506 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |  |
| email_507 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |  |
| email_508 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |  |
| email_509 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |  |
| email_510 | BL_COMPARISON | NEEDS_REVIEW | missing_attachment |  |
| email_511 | BL_COMPARISON | NEEDS_REVIEW | unreadable |  |
| email_512 | BL_COMPARISON | NEEDS_REVIEW | unreadable |  |
| email_513 | BL_COMPARISON | NEEDS_REVIEW | unreadable |  |
| email_514 | BL_COMPARISON | NEEDS_REVIEW | unreadable |  |
| email_515 | BL_COMPARISON | NEEDS_REVIEW | unreadable |  |
| email_516 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_517 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_518 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_519 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |
| email_520 | BL_COMPARISON | NEEDS_REVIEW | missing_value |  |

## Notes

- **LLM cache not warmed**: this run had no model-provider API keys in the environment, so classification used the deterministic keyword fallback for all 520 emails (no live model calls, `llm_cache.json` was not created). This doesn't affect the `BL_COMPARISON` field-comparison results above (extraction/comparison is independent of how an email was classified), but Tier-1 item #7 (warming the cache before demo day) still needs to be run separately by whoever holds the API keys.
- Ground truth (`ground_truth.json`) is not available to participants, so this run reports the pipeline's own output only — not scored accuracy against ground truth. Scoring requires the organizers' `score_cli.py` or the Docker `/submit` endpoint.

