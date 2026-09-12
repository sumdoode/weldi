import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { appErrorHandler } from "./upload-errors.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "server/data");
const uploadDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(root, "server/uploads");
const dbFile = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3001);
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });
try { await fs.access(dbFile); } catch { await fs.writeFile(dbFile, JSON.stringify({ welders: [], records: [] }, null, 2)); }

let queue = Promise.resolve();
const readDb = async () => JSON.parse(await fs.readFile(dbFile, "utf8"));
const updateDb = (change) => {
  const operation = queue.then(async () => {
    const db = await readDb();
    const result = await change(db);
    const temp = dbFile + ".tmp";
    await fs.writeFile(temp, JSON.stringify(db, null, 2));
    await fs.rename(temp, dbFile);
    return result;
  });
  queue = operation.catch(() => undefined);
  return operation;
};
const clean = value => String(value ?? "").trim() || "UNK";
const safeUnlink = file => file ? fs.unlink(file).catch(() => undefined) : Promise.resolve();
const normalize = record => {
  if (record.rootPhotoUrl || record.finalPhotoUrl) return {
    ...record,
    rootDate: record.rootDate || record.dateWelded || "UNK",
    rootVtDate: record.rootVtDate || "UNK",
    finalDate: record.finalDate || "UNK",
    finalWelderId: record.finalWelderId || (record.status === "COMPLETE" ? record.welderId : "UNK")
  };
  const isFinal = record.photoType === "FINAL";
  return {
    ...record,
    rootPhotoUrl: isFinal ? null : record.photoUrl,
    rootPhotoFilename: isFinal ? null : record.photoFilename,
    finalPhotoUrl: isFinal ? record.photoUrl : null,
    finalPhotoFilename: isFinal ? record.photoFilename : null,
    finalWelderId: isFinal ? record.welderId : "UNK",
    rootDate: isFinal ? "UNK" : record.dateWelded || "UNK",
    rootVtDate: "UNK",
    finalDate: isFinal ? record.dateWelded || "UNK" : "UNK",
    status: isFinal ? "COMPLETE" : "AWAITING_FINAL"
  };
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif" };
    callback(null, crypto.randomUUID() + (extensions[file.mimetype] || ""));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => callback(file.mimetype.startsWith("image/") ? null : new Error("Only image files are allowed."), file.mimetype.startsWith("image/"))
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir, { index: false, maxAge: "1h" }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/welders", async (_req,res,next)=>{try{const db=await readDb();res.json({welders:[...db.welders].sort((a,b)=>a.code.localeCompare(b.code))});}catch(e){next(e);}});
app.post("/api/welders",async(req,res,next)=>{try{const code=clean(req.body.code).toUpperCase();if(code==="UNK")return res.status(400).json({error:"Enter a welder ID."});const welder=await updateDb(db=>{if(db.welders.some(w=>w.code===code))throw new Error("That welder ID already exists.");const item={id:crypto.randomUUID(),code};db.welders.push(item);return item;});res.status(201).json({welder});}catch(e){next(e);}});
app.patch("/api/welders/:id",async(req,res,next)=>{try{const code=clean(req.body.code).toUpperCase();const welder=await updateDb(db=>{const item=db.welders.find(w=>w.id===req.params.id);if(!item)throw Object.assign(new Error("Welder ID not found."),{status:404});if(db.welders.some(w=>w.id!==item.id&&w.code===code))throw new Error("That welder ID already exists.");item.code=code;return item;});res.json({welder});}catch(e){next(e);}});
app.delete("/api/welders/:id",async(req,res,next)=>{try{await updateDb(db=>{db.welders=db.welders.filter(w=>w.id!==req.params.id);});res.json({deleted:true});}catch(e){next(e);}});

app.get("/api/welds",async(_req,res,next)=>{try{const db=await readDb();const records=db.records.map(normalize).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));res.json({records});}catch(e){next(e);}});
app.get("/api/export/pdf",async(_req,res,next)=>{
  try{
    const db=await readDb();
    const records=db.records.map(normalize).sort((a,b)=>String(a.lineNo).localeCompare(String(b.lineNo),undefined,{numeric:true})||String(a.weldNo).localeCompare(String(b.weldNo),undefined,{numeric:true}));
    const doc=new PDFDocument({size:"LETTER",margin:42,bufferPages:true,info:{Title:"Weld Inspection Report",Author:"Weld Photo Log"}});
    const chunks=[];doc.on("data",chunk=>chunks.push(chunk));
    const finished=new Promise((resolve,reject)=>{doc.on("end",resolve);doc.on("error",reject);});
    if(!records.length){doc.font("Helvetica-Bold").fontSize(22).text("Weld Inspection Report");doc.moveDown().font("Helvetica").fontSize(12).fillColor("#64748b").text("No weld records were available when this report was generated.");}
    for(let index=0;index<records.length;index++){
      if(index>0)doc.addPage();
      const record=records[index],complete=record.status==="COMPLETE";
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(22).text(`Weld ${record.weldNo}`,42,38);
      doc.fontSize(10).fillColor(complete?"#047857":"#b45309").text(complete?"COMPLETE":"AWAITING FINAL",430,43,{width:120,align:"right"});
      doc.moveTo(42,72).lineTo(570,72).strokeColor("#fbbf24").lineWidth(3).stroke();
      const details=[
        ["Line number",record.lineNo],["Rework",record.rework],["Root date",record.rootDate],["Root VT date",record.rootVtDate],
        ["Root welder",record.welderId],["Final welder",record.finalWelderId||"UNK"],["Final date",record.finalDate],["Final VT date",record.finalVtDate]
      ];
      details.forEach(([label,value],i)=>{const col=i%4,row=Math.floor(i/4),x=42+col*132,y=91+row*43;doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text(label.toUpperCase(),x,y);doc.font("Helvetica-Bold").fontSize(12).fillColor(value==="UNK"?"#b45309":"#0f172a").text(String(value),x,y+13,{width:120});});
      const drawPhoto=async(filename,label,x,missingText="Not added")=>{
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155").text(label,x,190,{width:250});
        doc.roundedRect(x,208,250,330,8).fillAndStroke("#f1f5f9","#cbd5e1");
        if(!filename){doc.font("Helvetica").fontSize(12).fillColor("#94a3b8").text(missingText,x,365,{width:250,align:"center"});return;}
        try{const image=await sharp(path.join(uploadDir,path.basename(filename))).rotate().jpeg({quality:88}).toBuffer();doc.image(image,x+8,216,{fit:[234,314],align:"center",valign:"center"});}catch{doc.font("Helvetica").fontSize(11).fillColor("#b91c1c").text("Photo could not be included",x,365,{width:250,align:"center"});}
      };
      await drawPhoto(record.rootPhotoFilename,"ROOT INSPECTION",42,record.rootDate==="N/A"?"N/A":"Not added");
      await drawPhoto(record.finalPhotoFilename,"FINAL INSPECTION",320);
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Generated ${new Date().toLocaleString("en-US")}`,42,725,{width:528,align:"center"});
    }
    doc.end();await finished;
    const output=Buffer.concat(chunks);
    res.set({"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="weld-inspection-report-${new Date().toISOString().slice(0,10)}.pdf"`,"Content-Length":String(output.length)});
    res.send(output);
  }catch(e){next(e);}
});
app.post("/api/welds",upload.single("photo"),async(req,res,next)=>{
  if(!req.file)return res.status(400).json({error:"A root inspection photo is required."});
  try{
    const clientRequestId=String(req.body.clientRequestId||"").trim();
    const record={
      id:crypto.randomUUID(),clientRequestId,status:"AWAITING_FINAL",
      lineNo:clean(req.body.lineNo),weldNo:clean(req.body.weldNo),rework:clean(req.body.rework),
      welderId:clean(req.body.welderId).toUpperCase(),finalWelderId:"UNK",
      rootDate:clean(req.body.rootDate),rootVtDate:clean(req.body.rootVtDate),finalDate:"UNK",finalVtDate:"UNK",
      rootPhotoUrl:`/uploads/${req.file.filename}`,rootPhotoFilename:req.file.filename,
      finalPhotoUrl:null,finalPhotoFilename:null,createdAt:new Date().toISOString(),completedAt:null
    };
    const saved=await updateDb(db=>{db.records=db.records.map(normalize);const existing=clientRequestId&&db.records.find(item=>item.clientRequestId===clientRequestId);if(existing)return {record:existing,duplicate:true};db.records.push(record);return {record,duplicate:false};});
    if(saved.duplicate)await safeUnlink(req.file.path);
    res.status(saved.duplicate?200:201).json({record:saved.record});
  }catch(e){await safeUnlink(req.file.path);next(e);}
});
app.post("/api/welds/final-only",upload.single("photo"),async(req,res,next)=>{
  if(!req.file)return res.status(400).json({error:"A final inspection photo is required."});
  try{
    const clientRequestId=String(req.body.clientRequestId||"").trim();
    const record={
      id:crypto.randomUUID(),clientRequestId,status:"COMPLETE",
      lineNo:clean(req.body.lineNo),weldNo:clean(req.body.weldNo),rework:"N/A",
      welderId:"N/A",finalWelderId:clean(req.body.finalWelderId).toUpperCase(),
      rootDate:"N/A",rootVtDate:"N/A",finalDate:clean(req.body.finalDate),finalVtDate:clean(req.body.finalVtDate),
      rootPhotoUrl:null,rootPhotoFilename:null,
      finalPhotoUrl:`/uploads/${req.file.filename}`,finalPhotoFilename:req.file.filename,
      createdAt:new Date().toISOString(),completedAt:new Date().toISOString()
    };
    const saved=await updateDb(db=>{db.records=db.records.map(normalize);const existing=clientRequestId&&db.records.find(item=>item.clientRequestId===clientRequestId);if(existing)return {record:existing,duplicate:true};db.records.push(record);return {record,duplicate:false};});
    if(saved.duplicate)await safeUnlink(req.file.path);
    res.status(saved.duplicate?200:201).json({record:saved.record});
  }catch(e){await safeUnlink(req.file.path);next(e);}
});
app.post("/api/welds/:id/final",upload.single("photo"),async(req,res,next)=>{
  if(!req.file)return res.status(400).json({error:"A final inspection photo is required."});
  try{
    const record=await updateDb(db=>{
      db.records=db.records.map(normalize);
      const item=db.records.find(r=>r.id===req.params.id);
      if(!item)throw Object.assign(new Error("Weld record not found."),{status:404});
      if(item.clientFinalRequestId===clean(req.body.clientRequestId))return {...item,_duplicate:true};
      if(item.finalPhotoFilename)throw new Error("This weld already has a final inspection.");
      item.finalPhotoUrl=`/uploads/${req.file.filename}`;item.finalPhotoFilename=req.file.filename;
      item.finalDate=clean(req.body.finalDate);item.finalVtDate=clean(req.body.finalVtDate);item.finalWelderId=clean(req.body.finalWelderId).toUpperCase();item.clientFinalRequestId=clean(req.body.clientRequestId);item.status="COMPLETE";item.completedAt=new Date().toISOString();
      return item;
    });
    if(record._duplicate){await safeUnlink(req.file.path);delete record._duplicate;}
    res.status(201).json({record});
  }catch(e){await safeUnlink(req.file.path);next(e);}
});
app.post("/api/welds/client/:clientId/final",upload.single("photo"),async(req,res,next)=>{
  if(!req.file)return res.status(400).json({error:"A final inspection photo is required."});
  try{
    const record=await updateDb(db=>{
      db.records=db.records.map(normalize);
      const item=db.records.find(r=>r.clientRequestId===req.params.clientId);
      if(!item)throw Object.assign(new Error("The root inspection has not synchronized yet."),{status:409});
      if(item.clientFinalRequestId===clean(req.body.clientRequestId))return {...item,_duplicate:true};
      if(item.finalPhotoFilename)throw new Error("This weld already has a final inspection.");
      item.finalPhotoUrl=`/uploads/${req.file.filename}`;item.finalPhotoFilename=req.file.filename;
      item.finalDate=clean(req.body.finalDate);item.finalVtDate=clean(req.body.finalVtDate);item.finalWelderId=clean(req.body.finalWelderId).toUpperCase();item.clientFinalRequestId=clean(req.body.clientRequestId);item.status="COMPLETE";item.completedAt=new Date().toISOString();
      return item;
    });
    if(record._duplicate){await safeUnlink(req.file.path);delete record._duplicate;}
    res.status(201).json({record});
  }catch(e){await safeUnlink(req.file.path);next(e);}
});
app.delete("/api/welds/:id",async(req,res,next)=>{try{const files=await updateDb(db=>{db.records=db.records.map(normalize);const found=db.records.find(r=>r.id===req.params.id);db.records=db.records.filter(r=>r.id!==req.params.id);return [found?.rootPhotoFilename,found?.finalPhotoFilename].filter(Boolean);});await Promise.all(files.map(name=>safeUnlink(path.join(uploadDir,path.basename(name)))));res.json({deleted:true});}catch(e){next(e);}});

app.use(express.static(path.join(root,"dist")));
app.get("/{*path}",async(req,res,next)=>{if(req.path.startsWith("/api/")||req.path.startsWith("/uploads/"))return next();try{await fs.access(path.join(root,"dist/index.html"));res.sendFile(path.join(root,"dist/index.html"));}catch{res.status(404).send("Run npm run build first.");}});
app.use(appErrorHandler);
app.listen(port,"0.0.0.0",()=>console.log(`Weld Photo Log server: http://localhost:${port}`));
