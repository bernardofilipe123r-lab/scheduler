---
description: "Add a new NicheConfig field — model, migration, PromptContext, service, frontend, validation"
agent: "agent"
tools: [execute, read, edit, search]
---

Add a new field to the NicheConfig (Content DNA) system. This touches 5+ files and requires strict ordering.

## Steps

### 1. Migration SQL (FIRST!)
Create `migrations/add_<field>_to_niche_config.sql`:
```sql
ALTER TABLE niche_configs ADD COLUMN IF NOT EXISTS <field> <type> DEFAULT <default>;
```
Run immediately:
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_<field>_to_niche_config.sql
```
Verify:
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'niche_configs' ORDER BY column_name;"
```

### 2. SQLAlchemy Model
Add column to `app/models/niche_config.py`:
```python
<field> = Column(<SQLAlchemyType>, nullable=True, default=<default>)
```

### 3. PromptContext Dataclass
Add field to `app/core/prompt_context.py`:
```python
<field>: Optional[<type>] = <default>
```

### 4. NicheConfig Service
Update `app/services/content/niche_config_service.py`:
- Add field to the `build_prompt_context()` method
- Map from DB model to PromptContext field

### 5. Prompt Templates (if needed)
If the field affects content generation, add it to relevant templates in `app/core/prompt_templates.py`

### 6. Frontend Config Form (if user-editable)
Add field to the NicheConfig editing UI in `src/features/content-dna/`

### 7. Validation
Run: `python scripts/validate_api.py` — this checks NicheConfig ↔ PromptContext alignment

### 8. Update Customization Files
Update `.github/skills/content-pipeline/SKILL.md` — add the new field to the PromptContext fields list
