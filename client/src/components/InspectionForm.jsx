import Field from "./Field.jsx";
import PhotoInput from "./PhotoInput.jsx";
import WelderSelect from "./WelderSelect.jsx";
import { today } from "../utils/inspectionFields.js";

export default function InspectionForm({
  type,
  formRef,
  preview,
  onPickPhoto,
  welderId,
  onWelderChange,
  welders,
  onManageWelders,
  onSubmit,
  onReset,
  saving,
}) {
  const isRoot = type === "root";
  const inspection = isRoot ? "Root" : "Final";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="capture-grid">
      <section className="card">
        <h2>1. {inspection} inspection photo</h2>
        <div className="card-body">
          {!isRoot && (
            <div className="info-note">
              Use this menu when no root inspection was recorded. Root fields
              will be saved as N/A.
            </div>
          )}
          <PhotoInput
            preview={preview}
            onPick={onPickPhoto}
            label={`Take ${inspection.toLowerCase()} photo`}
            alt={`Selected ${inspection.toLowerCase()} inspection`}
          />
        </div>
      </section>

      <section className="card">
        <h2>
          2. {inspection} weld details{" "}
          <small>
            {isRoot
              ? "The final inspection will reuse the line and weld numbers."
              : "Root inspection fields will be recorded as N/A."}
          </small>
        </h2>
        <div className="fields">
          <Field
            label="Line number"
            name="lineNo"
            inputMode="numeric"
            placeholder="e.g. 4196"
          />
          <Field
            label="Weld number"
            name="weldNo"
            inputMode="numeric"
            placeholder="e.g. 4062"
          />
          <WelderSelect
            label={`${inspection} welder ID`}
            value={welderId}
            onChange={onWelderChange}
            welders={welders}
            onManage={onManageWelders}
          />
          {isRoot && (
            <Field label="Rework" name="rework" placeholder="e.g. R1 or leave blank" />
          )}
          <Field
            label={isRoot ? "Root date" : "Final weld date"}
            name={isRoot ? "rootDate" : "finalDate"}
            type="date"
          />
          <Field
            label={`${inspection} VT date`}
            name={isRoot ? "rootVtDate" : "finalVtDate"}
            type="date"
            defaultValue={today()}
          />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onReset}>
            ↻
          </button>
          <button disabled={saving} className="primary">
            {saving
              ? "Saving…"
              : isRoot
                ? "✓ Save root inspection"
                : "✓ Save final-only inspection"}
          </button>
        </div>
      </section>
    </form>
  );
}
