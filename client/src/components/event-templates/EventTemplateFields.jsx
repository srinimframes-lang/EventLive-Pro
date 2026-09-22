import {
  TEMPLATE_FIELD_DEFS,
  TEMPLATE_IMAGE_DEFS,
  TEMPLATE_SECTION_DEFS,
  isExtendedPageTemplate,
  normalizePageTemplateData,
  normalizeTemplateSections,
} from '../../utils/eventTemplates.js';
import { resolveMediaUrl } from '../../utils/format.js';

function ImageUploadField({ label, preview, inputRef, uploading, onChange, hint }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          <img
            src={resolveMediaUrl(preview)}
            alt=""
            className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
            No image
          </div>
        )}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onChange}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            disabled={uploading}
          />
          <p className="mt-1 text-xs text-slate-400">
            {uploading ? 'Uploading…' : hint || 'JPG/PNG, up to 8 MB.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function EventTemplateFields({
  templateId,
  form,
  setForm,
  uploading,
  isEdit,
  imageRefs,
  onTemplateImage,
}) {
  if (!isExtendedPageTemplate(templateId)) return null;

  const fields = TEMPLATE_FIELD_DEFS[templateId] || [];
  const images = TEMPLATE_IMAGE_DEFS[templateId] || [];
  const sections = TEMPLATE_SECTION_DEFS[templateId] || [];
  const data = normalizePageTemplateData(templateId, form.pageTemplateData);
  const sectionMap = normalizeTemplateSections(templateId, data.sections);
  const venueLabel =
    templateId === 'temple-religious'
      ? 'Temple Location'
      : templateId === 'housewarming-gruhapravesham'
        ? 'Address'
        : 'Venue';

  const setData = (name, value) => {
    setForm((current) => ({
      ...current,
      pageTemplateData: {
        ...normalizePageTemplateData(templateId, current.pageTemplateData),
        [name]: value,
      },
    }));
  };

  const setSection = (id, patch) => {
    setForm((current) => {
      const next = normalizePageTemplateData(templateId, current.pageTemplateData);
      next.sections = {
        ...normalizeTemplateSections(templateId, next.sections),
        [id]: {
          ...normalizeTemplateSections(templateId, next.sections)[id],
          ...patch,
        },
      };
      return { ...current, pageTemplateData: next };
    });
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <p className="text-sm text-violet-950">
        This public page is independent of Wedding, Reception, and College Fest / Annual Day
        templates. Streaming destinations below are unchanged. Add gallery photos after you save.
      </p>
      <p className="text-xs text-slate-500">
        Date, time, venue, and event description use the Basics fields above.
      </p>

      {images.map((image) => (
        <ImageUploadField
          key={image.kind}
          label={image.label}
          preview={form[image.field]}
          inputRef={imageRefs?.[image.kind]}
          uploading={uploading}
          onChange={(e) => onTemplateImage(image.kind, e)}
          hint={isEdit ? 'Shown on the public page.' : 'Selected images upload when you create the event.'}
        />
      ))}

      <div>
        <label htmlFor="et-venue" className="mb-1 block text-sm font-medium text-slate-700">
          {venueLabel}
        </label>
        <input
          id="et-venue"
          className="input"
          maxLength={200}
          placeholder="e.g. Community Hall"
          value={form.venue || ''}
          onChange={(e) => setForm((current) => ({ ...current, venue: e.target.value }))}
        />
      </div>

      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={`et-${field.name}`} className="mb-1 block text-sm font-medium text-slate-700">
            {field.label}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              id={`et-${field.name}`}
              className="input min-h-[5.5rem]"
              maxLength={2000}
              placeholder={field.placeholder || ''}
              value={data[field.name] || ''}
              onChange={(e) => setData(field.name, e.target.value)}
            />
          ) : (
            <input
              id={`et-${field.name}`}
              className="input"
              maxLength={400}
              placeholder={field.placeholder || ''}
              value={data[field.name] || ''}
              onChange={(e) => setData(field.name, e.target.value)}
            />
          )}
        </div>
      ))}

      {sections.length ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Optional sections</p>
          <p className="mb-3 text-xs text-slate-500">
            Disabled sections stay hidden on the public page.
          </p>
          <div className="space-y-3">
            {sections.map((section) => {
              const current = sectionMap[section.id] || { enabled: false, note: '' };
              return (
                <div key={section.id} className="rounded-lg border border-violet-100 bg-white/70 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(current.enabled)}
                      onChange={(e) => setSection(section.id, { enabled: e.target.checked })}
                    />
                    {section.label}
                  </label>
                  {current.enabled ? (
                    <input
                      className="input mt-2"
                      maxLength={300}
                      placeholder={`Optional note for ${section.label.toLowerCase()}`}
                      value={current.note}
                      onChange={(e) => setSection(section.id, { note: e.target.value })}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
