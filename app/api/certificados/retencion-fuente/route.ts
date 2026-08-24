import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContratoKaring = Record<string, unknown>;

type PlanExequialSolicitud = {
  contrato: string;
  producto: string;
};

type ProveedorValido = {
  identificacion: string;
  nombre: string | null;
  email: string | null;
};

const execFileAsync = promisify(execFile);

const LIMITE_DIARIO_RETENCION_FUENTE = 3;
const NIT_COTRAFA_SOCIAL = "811017024";

const PRODUCTOS_EXEQUIALES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  13, 14, 15, 16, 17, 18, 19, 20,
  481, 482, 483, 484, 485, 486, 487, 489, 490, 491, 492, 493, 494, 495,
  496, 497, 498, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509,
  510, 511, 512, 513, 514, 515, 628, 734, 1804, 1805, 1894, 1895, 1896,
  1898, 1899, 1900, 1903,
]);

function obtenerTexto(valor: unknown) {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function obtenerNumero(valor: unknown) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return valor;
  }

  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor.trim());
    return Number.isFinite(numero) ? numero : null;
  }

  return null;
}

function contratoEsExequial(contrato: ContratoKaring) {
  const productoPrevision = obtenerNumero(contrato.producto_prevision);

  if (productoPrevision === null) {
    return false;
  }

  return PRODUCTOS_EXEQUIALES.has(productoPrevision);
}

function normalizarNit(valor: unknown) {
  return String(valor || "").replace(/\D/g, "").trim();
}

function contratoEsEmpresarial(contrato: ContratoKaring) {
  const nitGrupal = normalizarNit(contrato.nit_grupal);
  return nitGrupal !== "" && nitGrupal !== NIT_COTRAFA_SOCIAL;
}

function contratoTieneActionActiva(contrato: ContratoKaring) {
  return String(contrato.action ?? "").trim().toUpperCase() === "A";
}

function obtenerContratosEmpresarialesActivos(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return contratoTieneActionActiva(contrato) && contratoEsEmpresarial(contrato);
  });
}

function obtenerContratosExequiales(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => contratoEsExequial(contrato));
}

function generarCodigoSolicitud() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `SOL-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
}

function generarCodigoAutenticidad() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `CS-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
}

function obtenerFechaRegistroTexto() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function obtenerFechaDiaColombia() {
  return new Date().toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function obtenerSoloFechaDesdeRegistro(fechaRegistro: unknown) {
  if (typeof fechaRegistro !== "string") {
    return "";
  }

  return fechaRegistro.split(",")[0].trim();
}

function obtenerClienteGoogleSheets() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_WORKSPACE_SUBJECT;

  if (!clientEmail || !privateKey || !subject) {
    throw new Error("Faltan variables de entorno de Google Workspace.");
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    subject,
  });
}

async function obtenerToken() {
  const authUrl = process.env.KARING_AUTH_URL;
  const usuario = process.env.KARING_USER;
  const clave = process.env.KARING_PASSWORD;

  if (!authUrl || !usuario || !clave) {
    throw new Error("Faltan variables de entorno de autenticación Karing.");
  }

  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      usuario,
      clave,
      "Accept-Encoding": "identity",
    },
  });

  const textoRespuesta = await response.text();

  if (!response.ok) {
    throw new Error("No fue posible autenticar en Karing.");
  }

  const token = textoRespuesta.replace(/^"|"$/g, "").trim();

  if (!token) {
    throw new Error("Karing autenticó, pero no devolvió token.");
  }

  return token;
}

async function consultarTercero(tercero: string, token: string) {
  const tercerosUrl = process.env.KARING_TERCERO_URL;

  if (!tercerosUrl) {
    throw new Error("Falta configurar KARING_TERCERO_URL.");
  }

  const urlConsulta = new URL(tercerosUrl);
  urlConsulta.searchParams.set("tercero", tercero);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  const textoRespuesta = await response.text();

  if (!response.ok || !textoRespuesta || textoRespuesta.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(textoRespuesta) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function terceroEsProveedorValido(tercero: Record<string, unknown> | null) {
  if (!tercero) {
    return false;
  }

  const estado = String(tercero.estado || "").trim().toUpperCase();

  return estado === "A";
}

async function consultarProveedorValido(
  identificacion: string,
  token: string
): Promise<ProveedorValido | null> {
  const tercero = await consultarTercero(identificacion, token);

  if (!terceroEsProveedorValido(tercero)) {
    return null;
  }

  return {
    identificacion: obtenerTexto(tercero?.tercero) || identificacion,
    nombre: obtenerTexto(tercero?.nombre),
    email: obtenerTexto(tercero?.email),
  };
}

async function consultarContratos(identificacion: string, token: string) {
  const contratosUrl = process.env.KARING_CONTRATOS_URL;

  if (!contratosUrl) {
    throw new Error("Falta configurar KARING_CONTRATOS_URL.");
  }

  const urlConsulta = new URL(contratosUrl);
  urlConsulta.searchParams.set("identificacion", identificacion);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  if (!response.ok) {
    return [];
  }

  const textoRespuesta = await response.text();

  try {
    const data = JSON.parse(textoRespuesta);

    if (!Array.isArray(data)) {
      return [];
    }

    return data as ContratoKaring[];
  } catch {
    return [];
  }
}

async function consultarContratoPorNumero(contrato: string, token: string) {
  const contratoUrl = process.env.KARING_CONTRATO_URL;

  if (!contratoUrl) {
    throw new Error("Falta configurar KARING_CONTRATO_URL.");
  }

  const urlConsulta = new URL(contratoUrl);
  urlConsulta.searchParams.set("contrato", contrato);

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": token,
      "Content-Type": "application/json",
      "Accept-Encoding": "identity",
    },
  });

  if (!response.ok) {
    throw new Error("No fue posible consultar el detalle del contrato.");
  }

  const textoRespuesta = await response.text();

  try {
    return JSON.parse(textoRespuesta) as Record<string, unknown>;
  } catch {
    throw new Error("La respuesta del contrato no tiene formato JSON válido.");
  }
}

function obtenerNombreProductoDesdeDetalle(detalleContrato: unknown) {
  if (
    !detalleContrato ||
    typeof detalleContrato !== "object" ||
    Array.isArray(detalleContrato)
  ) {
    return "Plan exequial";
  }

  const amparos = (detalleContrato as Record<string, unknown>).amparos;

  if (!Array.isArray(amparos) || amparos.length === 0) {
    return "Plan exequial";
  }

  const primerAmparo = amparos[0];

  if (
    !primerAmparo ||
    typeof primerAmparo !== "object" ||
    Array.isArray(primerAmparo)
  ) {
    return "Plan exequial";
  }

  return (
    obtenerTexto(
      (primerAmparo as Record<string, unknown>).descripcion_producto
    ) || "Plan exequial"
  );
}

async function obtenerPlanesExequiales(
  contratosExequiales: ContratoKaring[],
  token: string
) {
  const planes: PlanExequialSolicitud[] = [];

  for (const contrato of contratosExequiales) {
    const numeroContrato = obtenerTexto(contrato.contrato);

    if (!numeroContrato) {
      continue;
    }

    const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);

    planes.push({
      contrato: numeroContrato,
      producto: obtenerNombreProductoDesdeDetalle(detalleContrato),
    });
  }

  return planes;
}

async function contarSolicitudesRetencionFuenteHoy(identificacion: string) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  const respuesta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Solicitudes'!A:I",
  });

  const filas = respuesta.data.values || [];
  const fechaHoy = obtenerFechaDiaColombia();
  const identificacionNormalizada = identificacion.trim();

  return filas.filter((fila) => {
    const fechaCreacion = obtenerSoloFechaDesdeRegistro(fila[0]);
    const usuCreacion = String(fila[2] || "").trim();
    const tipoDoc = String(fila[5] || "").trim().toLowerCase();

    return (
      fechaCreacion === fechaHoy &&
      usuCreacion === identificacionNormalizada &&
      tipoDoc === "certificado de retención en la fuente"
    );
  }).length;
}

async function registrarSolicitudEnSheets(datos: {
  fechaCreacion: string;
  usuCreacion: string;
  codigoDoc: string;
  tipoDoc: string;
  quienNecesitaDoc: string;
  dirigidoADoc: string;
  datosDoc: string;
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Solicitudes'!A:I",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaCreacion,
          "",
          datos.usuCreacion,
          "",
          datos.codigoDoc,
          datos.tipoDoc,
          datos.quienNecesitaDoc,
          datos.dirigidoADoc,
          datos.datosDoc,
        ],
      ],
    },
  });
}

async function registrarSolicitudNivel2RetencionFuente(datos: {
  fechaSolicitud: string;
  tipoSolicitud: string;
  cedula: string;
  nombre: string;
  correo: string;
  codigoSolicitud: string;
  contratosTexto: string;
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_NIVEL2_ID;

  if (!spreadsheetId) {
    throw new Error("Falta GOOGLE_SHEET_NIVEL2_ID.");
  }

  const auth = obtenerClienteGoogleSheets();

  const sheets = google.sheets({
    version: "v4",
    auth,
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'11. Retencion en la fuente'!A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaSolicitud,
          "APLICATIVO WEB",
          datos.tipoSolicitud,
          datos.cedula,
          datos.nombre,
          "Correo",
          datos.correo,
          `${datos.codigoSolicitud} / ${datos.contratosTexto}`,
        ],
      ],
    },
  });
}

function generarHtmlCorreoCertificadoRetencion(datos: {
  nombreAfiliado: string;
  codigoAutenticidad?: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const imagenCorreo = `${urlBase}/correos/respuesta-correo-certi.jpg`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.08);">
                <tr>
                  <td>
                    <img
                      src="${imagenCorreo}"
                      alt="Certificado generado Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      Certificado generado exitosamente
                    </h1>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hola, <strong style="color:#002869;">${datos.nombreAfiliado}</strong>.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Nos complace informarte que tu certificado de
                      <strong style="color:#002869;">Retención en la fuente</strong>
                      ha sido generado exitosamente.
                    </p>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Lo encontrarás adjunto en este correo para que puedas consultarlo,
                      descargarlo o compartirlo cuando lo necesites.
                    </p>
                    ${
                      datos.codigoAutenticidad
                        ? `
                          <p style="margin:18px 0 0; color:#4b5563; font-size:14px; line-height:1.7;">
                            Código de autenticidad:
                            <strong style="color:#002869;">${datos.codigoAutenticidad}</strong>
                          </p>
                          <p style="margin:10px 0 0; color:#4b5563; font-size:13px; line-height:1.7;">
                            Puedes validar este documento en:
                            <br />
                            <strong style="color:#002869;">
                              ${urlBase}/validar-documento?codigo=${encodeURIComponent(datos.codigoAutenticidad)}
                            </strong>
                          </p>
                        `
                        : ""
                    }

                    <p style="margin:26px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
                      Cotrafa Social
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background:#002869; padding:18px 28px; text-align:center;">
                    <p style="margin:0; color:#ffffff; font-size:11px; line-height:1.5;">
                      Este mensaje fue generado automáticamente. Por favor no respondas a este correo.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function generarHtmlSolicitudRetencionFuente(datos: {
  nombre: string;
  identificacion: string;
  contratosTexto: string;
  productosTexto: string;
}) {
  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://test-autosolicitudes.cotrafasocial.com";

  const imagenCorreo = `${urlBase}/correos/respuesta-correo-soli.jpg`;

  return `
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:30px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.08);">
                <tr>
                  <td>
                    <img
                      src="${imagenCorreo}"
                      alt="Solicitud registrada Cotrafa Social"
                      style="display:block; width:100%; max-width:680px; height:auto; border:0;"
                    />
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px 38px 30px; text-align:center;">
                    <h1 style="margin:0; color:#002869; font-size:26px; line-height:1.3; font-weight:800;">
                      Hemos recibido tu solicitud
                    </h1>

                    <p style="margin:18px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Hemos recibido tu solicitud de
                      <strong style="color:#002869;">Certificado de Retención en la fuente</strong>.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#002869;">Nombre:</strong> ${datos.nombre}<br />
                          <strong style="color:#002869;">Identificación:</strong> ${datos.identificacion}<br />
                          <strong style="color:#002869;">Contrato(s):</strong> ${datos.contratosTexto}<br />
                          <strong style="color:#002869;">Producto(s):</strong> ${datos.productosTexto}
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0; color:#4b5563; font-size:15px; line-height:1.7;">
                      Tu certificado estará listo en un plazo máximo de
                      <strong>tres (3) días hábiles</strong> y podrás reclamarlo de manera presencial
                      en la oficina que seleccionaste. Si tienes alguna duda o inquietud, comunícate
                      con nuestra línea de atención al cliente al <strong>456 7000</strong>.
                    </p>

                    <p style="margin:26px 0 0; color:#002869; font-size:15px; line-height:1.6; font-weight:700;">
                      Cotrafa Social
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="background:#002869; padding:18px 28px; text-align:center;">
                    <p style="margin:0; color:#ffffff; font-size:11px; line-height:1.5;">
                      Este mensaje fue generado automáticamente. Por favor no respondas a este correo.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function enviarCertificadoPorCorreo(datos: {
  destinatario: string;
  nombreAfiliado: string;
  pdfBytes: Buffer;
  codigoAutenticidad?: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Faltan variables de entorno para envío de correo.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"Cotrafa Social" <${from}>`,
    to: datos.destinatario,
    subject: "Certificado de Retención en la fuente",
    html: generarHtmlCorreoCertificadoRetencion({
      nombreAfiliado: datos.nombreAfiliado,
      codigoAutenticidad: datos.codigoAutenticidad,
    }),
    attachments: [
      {
        filename: "certificado-retencion-en-la-fuente.pdf",
        content: datos.pdfBytes,
        contentType: "application/pdf",
      },
    ],
  });
}

async function enviarCorreoConfirmacion(datos: {
  destinatario: string;
  nombre: string;
  identificacion: string;
  contratosTexto: string;
  productosTexto: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error("Faltan variables de entorno para envío de correo.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  await transporter.sendMail({
    from: `"Cotrafa Social" <${from}>`,
    to: datos.destinatario,
    subject: "Solicitud de Certificado de Retención en la fuente registrada",
    html: generarHtmlSolicitudRetencionFuente({
      nombre: datos.nombre,
      identificacion: datos.identificacion,
      contratosTexto: datos.contratosTexto,
      productosTexto: datos.productosTexto,
    }),
  });
}

function construirParametrosGetInformes(identificacionProveedor: string) {
  return [
    "compania=1",
    "sucursal=1",
    "deperiodo=136",
    "aperiodo=147",
    `detercero=${identificacionProveedor}`,
    `atercero=${identificacionProveedor}`,
    "decuenta=2445",
    "acuenta=244570099",
    "titulo=CERTIFICADO DE RETENCION EN LA FUENTE AÑO GRAVABLE 2025",
    "consignado=ADMINISTRACION DE IMPUESTOS NACIONALES DE MEDELLIN",
    "localniif=2",
  ].join(";");
}

function pdfRetencionTieneContenidoValido(pdfBytes: Buffer) {
  const textoInicial = pdfBytes.subarray(0, 3000).toString("latin1").toLowerCase();

  const mensajesError = [
    "the current data set presented",
    "did not produce any significant content",
    "no pages were generated",
  ];

  const contieneMensajeError = mensajesError.some((mensaje) =>
    textoInicial.includes(mensaje)
  );

  if (contieneMensajeError) {
    return false;
  }

  if (pdfBytes.length < 5000) {
    return false;
  }

  return true;
}

async function consultarPdfRetencionKaring(datos: {
  identificacionProveedor: string;
  token: string;
}) {
  const getInformesUrl = process.env.KARING_GET_INFORMES_URL;
  const nombreReporte =
    process.env.RETENCION_REPORTE_NOMBRE ||
    "dw_contabilidad_informes_certificados_retencion";
  const terceroEmpresa = process.env.RETENCION_TERCERO_EMPRESA || "811017024";

  if (!getInformesUrl) {
    throw new Error("Falta configurar KARING_GET_INFORMES_URL.");
  }

  const urlConsulta = new URL(getInformesUrl);

  urlConsulta.searchParams.set("NombreReporte", nombreReporte);
  urlConsulta.searchParams.set(
    "Params",
    construirParametrosGetInformes(datos.identificacionProveedor)
  );
  urlConsulta.searchParams.set("tercero", terceroEmpresa);
  urlConsulta.searchParams.set("email", "false");
  urlConsulta.searchParams.set("tipo_seguimiento", "41");

  const response = await fetch(urlConsulta.toString(), {
    method: "GET",
    headers: {
      "Authorization-Token": datos.token,
      "Accept-Encoding": "identity",
    },
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const encabezado = buffer.subarray(0, 20).toString("utf8");
  const textoDebug = buffer.subarray(0, 500).toString("utf8");
  
  console.log("GETINFORMES RETENCION DEBUG:", {
    url: urlConsulta.toString(),
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    bufferLength: buffer.length,
    encabezado,
    textoDebug,
  });
  
  if (!response.ok || buffer.length === 0) {
    return null;
  }
  
  if (!buffer.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
    return null;
  }
  
  if (!pdfRetencionTieneContenidoValido(buffer)) {
    console.log("RETENCION: Karing devolvió PDF sin contenido válido.", {
      identificacionProveedor: datos.identificacionProveedor,
      bufferLength: buffer.length,
    });
  
    return null;
  }
  
  return buffer;
}



async function desencriptarPdfSinClave(pdfBytes: Buffer) {
  const password = process.env.RETENCION_PDF_PASSWORD || "811017024";

  const carpetaTemporal = await fs.mkdtemp(path.join(os.tmpdir(), "retencion-"));

  const entrada = path.join(carpetaTemporal, "entrada.pdf");
  const salida = path.join(carpetaTemporal, "salida-sin-clave.pdf");

  try {
    await fs.writeFile(entrada, new Uint8Array(pdfBytes));

    await execFileAsync("qpdf", [
      `--password=${password}`,
      "--decrypt",
      entrada,
      salida,
    ]);

    const pdfSinClave = await fs.readFile(salida);

    if (!pdfSinClave.subarray(0, 5).toString("utf8").startsWith("%PDF-")) {
      throw new Error("qpdf generó una salida que no parece PDF.");
    }

    return pdfSinClave;
  } finally {
    await fs.rm(carpetaTemporal, { recursive: true, force: true });
  }
}



async function registrarSolicitudManualRetencion(datos: {
  identificacionTexto: string;
  proveedor: ProveedorValido;
  contratosTexto: string;
  productosTexto: string;
}) {
  const codigoSolicitud = generarCodigoSolicitud();

  const datosDoc = JSON.stringify([
    {
      solicitud: "Certificado de Retención en la fuente",
      tipoSolicitante: "proveedor",
      nombre: datos.proveedor.nombre,
      identificacion: datos.proveedor.identificacion,
      correoRelacionado: datos.proveedor.email,
      contratos: datos.contratosTexto,
      productos: datos.productosTexto,
      origen: "fallback_get_informes",
      motivo:
        "No fue posible generar automáticamente el PDF desde GetInformes. Se crea solicitud para validación manual.",
    },
  ]);

  await registrarSolicitudEnSheets({
    fechaCreacion: obtenerFechaRegistroTexto(),
    usuCreacion: datos.identificacionTexto,
    codigoDoc: codigoSolicitud,
    tipoDoc: "Certificado de Retención en la fuente",
    quienNecesitaDoc: "Proveedor",
    dirigidoADoc: "No aplica",
    datosDoc,
  });

  await registrarSolicitudNivel2RetencionFuente({
    fechaSolicitud: obtenerFechaRegistroTexto(),
    tipoSolicitud: "Retención en la fuente proveedor",
    cedula: datos.proveedor.identificacion || datos.identificacionTexto,
    nombre: datos.proveedor.nombre || "",
    correo: datos.proveedor.email || "",
    codigoSolicitud,
    contratosTexto: datos.contratosTexto,
  });

  await enviarCorreoConfirmacion({
    destinatario: datos.proveedor.email || "",
    nombre: datos.proveedor.nombre || "Proveedor",
    identificacion: datos.proveedor.identificacion || datos.identificacionTexto,
    contratosTexto: datos.contratosTexto,
    productosTexto: datos.productosTexto,
  });

  return codigoSolicitud;
}

export async function POST(request: Request) {
  try {
    const { identificacion } = await request.json();

    if (!identificacion || !String(identificacion).trim()) {
      return NextResponse.json(
        { ok: false, message: "Debe ingresar un número de documento." },
        { status: 400 }
      );
    }

    const identificacionTexto = String(identificacion).trim();

    const token = await obtenerToken();

    const proveedor = await consultarProveedorValido(identificacionTexto, token);

    if (!proveedor) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Esta solicitud solo está disponible para proveedores activos de Cotrafa Social.",
        },
        { status: 403 }
      );
    }

    if (!proveedor.nombre || !proveedor.email) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible generar el certificado porque el proveedor no tiene nombre o correo registrado.",
        },
        { status: 422 }
      );
    }

    const cantidadSolicitudesHoy = await contarSolicitudesRetencionFuenteHoy(
      identificacionTexto
    );

    if (cantidadSolicitudesHoy >= LIMITE_DIARIO_RETENCION_FUENTE) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible generar o registrar la solicitud porque ya alcanzaste el límite diario permitido para este documento.",
        },
        { status: 429 }
      );
    }

    const contratos = await consultarContratos(identificacionTexto, token);
    const contratosEmpresariales = obtenerContratosEmpresarialesActivos(contratos);
    const contratosExequiales = obtenerContratosExequiales(contratos);

    const contratosBase =
      contratosEmpresariales.length > 0
        ? contratosEmpresariales
        : contratosExequiales;

        const planes = await obtenerPlanesExequiales(contratosBase, token);

    const contratosTexto =
      planes.length > 0
        ? planes.map((plan) => plan.contrato).filter(Boolean).join(" / ")
        : "No aplica";

    const productosTexto =
      planes.length > 0
        ? planes.map((plan) => plan.producto).filter(Boolean).join(" / ")
        : "Proveedor";

        const pdfKaring = await consultarPdfRetencionKaring({
          identificacionProveedor: proveedor.identificacion || identificacionTexto,
          token,
        });
    
        if (!pdfKaring) {
          return NextResponse.json(
            {
              ok: false,
              estado: "sin-retencion",
              message:
                "No encontramos certificado de Retención en la fuente disponible para el documento ingresado.",
            },
            { status: 404 }
          );
        }
    
        const codigoAutenticidad = generarCodigoAutenticidad();
    
        let pdfConQr = pdfKaring;
    
        try {
          pdfConQr = await desencriptarPdfSinClave(pdfKaring);
          console.log("RETENCION PDF: se enviará PDF sin clave.");
        } catch (errorDesencriptar) {
          console.error(
            "RETENCION PDF: no fue posible quitar la clave. Se enviará el PDF original de Karing:",
            errorDesencriptar
          );
        }
    
        const datosDoc = JSON.stringify([
          {
            certificado: "Certificado de Retención en la fuente",
            tipoSolicitante: "retencion",
            estado: "generado automatico",
            nombre: proveedor.nombre,
            identificacion: proveedor.identificacion,
            correoRelacionado: proveedor.email,
            contratos: contratosTexto,
            productos: productosTexto,
            fuente: "GetInformes",
          },
        ]);
    
        await registrarSolicitudEnSheets({
          fechaCreacion: obtenerFechaRegistroTexto(),
          usuCreacion: identificacionTexto,
          codigoDoc: codigoAutenticidad,
          tipoDoc: "Certificado de Retención en la fuente",
          quienNecesitaDoc: "Proveedor",
          dirigidoADoc: "No aplica",
          datosDoc,
        });
    
        await enviarCertificadoPorCorreo({
          destinatario: proveedor.email,
          nombreAfiliado: proveedor.nombre,
          pdfBytes: pdfConQr,
          codigoAutenticidad,
        });
    
        return NextResponse.json(
          {
            ok: true,
            estado: "generado",
            message:
              "Tu certificado de Retención en la fuente fue generado exitosamente y enviado al correo electrónico registrado.",
          },
          { status: 200 }
        );
  } catch (error) {
    console.error("Error generando certificado de Retención en la fuente:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "No fue posible generar el certificado de Retención en la fuente en este momento.",
      },
      { status: 500 }
    );
  }
}