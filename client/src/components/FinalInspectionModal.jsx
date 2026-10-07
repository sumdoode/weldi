import Field from "./Field.jsx";
import Meta from "./Meta.jsx";
import PhotoInput from "./PhotoInput.jsx";
import WelderSelect from "./WelderSelect.jsx";
import { today } from "../utils/inspectionFields.js";

export default function FinalInspectionModal({
  record,
  welderId,
  onWelderChange,
  welders,
  preview,
  onPickPhoto,
  onSubmit,
  onClose,
  saving,
}) {
  return (
    <div className="overlay">
      <form className="modal final-modal" onSubmit={onSubmit}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <h2>Add final inspection</h2>
        <p>Line <b>{record.lineNo}</b> · Weld <b>{record.weldNo}</b></p>
        <div className="locked">
          <Meta label="Line number" value={record.lineNo} />
          <Meta label="Weld number" value={record.weldNo} />
          <Meta label="Root welder" value={record.welderId} />
          <Meta label="Root VT date" value={record.rootVtDate} />
        </div>
        <WelderSelect
          label="Final welder ID"
          value={welderId}
          onChange={onWelderChange}
          welders={welders}
        />
        <Field label="Final weld date" name="finalDate" type="date" />
        <PhotoInput
          className="photo final-photo"
          preview={preview}
          onPick={onPickPhoto}
          label="Take final photo"
          alt="Selected final inspection"
          showHint={false}
        />
        <Field label="Final VT date" name="finalVtDate" type="date" defaultValue={today()} />
        <button className="primary modal-save" disabled={saving}>
          {saving ? "Saving…" : "✓ Complete weld record"}
        </button>
      </form>
    </div>
  );
}
