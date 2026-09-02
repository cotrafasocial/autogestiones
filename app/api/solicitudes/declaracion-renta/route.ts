import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContratoKaring = Record<string, unknown>;

type PlanSolicitud = {
  contrato: string;
  producto: string;
};

const LIMITE_DIARIO_DECLARACION_RENTA = 3;

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

function contratoEstaVigente(contrato: ContratoKaring) {
  const renovacion = String(contrato.renovacion ?? "")
    .trim()
    .toUpperCase();

  return renovacion !== "C";
}

function contratoEsExequial(contrato: ContratoKaring) {
  const productoPrevision = obtenerNumero(contrato.producto_prevision);

  if (productoPrevision === null) {
    return false;
  }

  return PRODUCTOS_EXEQUIALES.has(productoPrevision);
}

const NIT_COTRAFA_SOCIAL = "811017024";

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
    return (
      contratoTieneActionActiva(contrato) &&
      contratoEstaVigente(contrato) &&
      contratoEsEmpresarial(contrato)
    );
  });
}

function obtenerContratosExequiales(contratos: ContratoKaring[]) {
  return contratos.filter((contrato) => {
    return contratoEstaVigente(contrato) && contratoEsExequial(contrato);
  });
}

function obtenerTipoIdentificacionTexto(codigo: string | null) {
  const tipos: Record<string, string> = {
    "31": "cedula de ciudadania",
    "13": "cedula de ciudadania",
    "12": "tarjeta de identidad",
    "11": "registro civil",
    "22": "cédula de extranjería",
  };

  if (!codigo) {
    return null;
  }

  return tipos[codigo.trim()] || codigo.trim();
}

function obtenerDatosTitular(contratos: ContratoKaring[]) {
  const contratoBase = contratos[0];

  const primerNombre = obtenerTexto(contratoBase?.primer_nombre);
  const segundoNombre = obtenerTexto(contratoBase?.segundo_nombre);
  const primerApellido = obtenerTexto(contratoBase?.primer_apellido);
  const segundoApellido = obtenerTexto(contratoBase?.segundo_apellido);

  const nombreCompleto = [
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido,
  ]
    .filter(Boolean)
    .join(" ");

  const tipoIdentificacionCodigo = obtenerTexto(contratoBase?.tipo_identificacion);

  return {
    nombre: nombreCompleto || null,
    tipoIdentificacion: obtenerTipoIdentificacionTexto(tipoIdentificacionCodigo),
    identificacion: obtenerTexto(contratoBase?.identificacion),
    email: obtenerTexto(contratoBase?.email),
    contacto:
      obtenerTexto(contratoBase?.celular) ||
      obtenerTexto(contratoBase?.telefonos) ||
      obtenerTexto(contratoBase?.telefono) ||
      "",
  };
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

async function consultarContratos(identificacion: string) {
  const contratosUrl = process.env.KARING_CONTRATOS_URL;

  if (!contratosUrl) {
    throw new Error("Falta configurar KARING_CONTRATOS_URL.");
  }

  const token = await obtenerToken();

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
    throw new Error("No fue posible consultar contratos.");
  }

  const textoRespuesta = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(textoRespuesta);
  } catch {
    throw new Error("La respuesta de contratos no tiene formato JSON válido.");
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No se encontraron contratos.");
  }

  return data as ContratoKaring[];
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

async function obtenerPlanesExequiales(contratosExequiales: ContratoKaring[]) {
  const token = await obtenerToken();
  const planes: PlanSolicitud[] = [];

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

function generarCodigoSolicitud() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `SOL-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
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

async function contarSolicitudesDeclaracionRentaHoy(identificacion: string) {
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
      tipoDoc === "declaración de renta"
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

async function registrarSolicitudNivel2DeclaracionRenta(datos: {
  fechaSolicitud: string;
  cedula: string;
  nombre: string;
  correo: string;
  codigoSolicitud: string;
  contratosTexto: string;
  contacto: string;
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
    range: "'12.Declaración Renta'!A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaSolicitud,
          "APLICATIVO WEB",
          "Declaración de renta",
          datos.cedula,
          datos.nombre,
          "Correo",
          datos.correo,
          `${datos.codigoSolicitud} / ${datos.contratosTexto}`,
          datos.contacto,
          "",
          "",
          "",
        ],
      ],
    },
  });
}

function generarHtmlSolicitudDeclaracionRenta(datos: {
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
                      <strong style="color:#002869;">Declaración de renta</strong>.
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
                      En un plazo máximo de <strong>tres (3) días hábiles</strong>, te enviaremos una respuesta
                      o actualización sobre el estado de tu trámite al último correo electrónico registrado
                      en nuestro sistema, en caso de no recibir respuesta comunícate al 456 7000.
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

async function enviarCorreoConfirmacion(datos: {
  destinatario: string;
  nombre: string;
  identificacion: string;
  contratosTexto: string;
  productosTexto: string;
  codigoSolicitud: string;
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
    subject: "Solicitud de Declaración de renta registrada",
    html: generarHtmlSolicitudDeclaracionRenta({
      nombre: datos.nombre,
      identificacion: datos.identificacion,
      contratosTexto: datos.contratosTexto,
      productosTexto: datos.productosTexto,
    }),
  });
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

    const cantidadSolicitudesHoy = await contarSolicitudesDeclaracionRentaHoy(
      identificacionTexto
    );

    if (cantidadSolicitudesHoy >= LIMITE_DIARIO_DECLARACION_RENTA) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible registrar la solicitud porque ya alcanzaste el límite diario permitido para este documento.",
        },
        { status: 429 }
      );
    }

    const contratos = await consultarContratos(identificacionTexto);

    const contratosEmpresarialesActivos =
      obtenerContratosEmpresarialesActivos(contratos);

    const contratosExequiales = obtenerContratosExequiales(contratos);

    const contratosParaSolicitud =
      contratosExequiales.length > 0
        ? contratosExequiales
        : contratosEmpresarialesActivos;

    const esSolicitudEmpresarial =
  contratosExequiales.length === 0 && contratosEmpresarialesActivos.length > 0;

    if (contratosParaSolicitud.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible registrar la solicitud porque no se encontraron contratos válidos.",
        },
        { status: 422 }
      );
    }

    const datosTitular = obtenerDatosTitular(contratosParaSolicitud);

    if (
      !datosTitular.nombre ||
      !datosTitular.identificacion ||
      !datosTitular.tipoIdentificacion
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible obtener la información del titular para registrar la solicitud.",
        },
        { status: 422 }
      );
    }

    if (!datosTitular.email) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible registrar la solicitud porque no hay correo relacionado a la cédula.",
        },
        { status: 422 }
      );
    }

    const codigoSolicitud = generarCodigoSolicitud();

    const planesSolicitud = esSolicitudEmpresarial
      ? contratosParaSolicitud.map((contrato) => ({
          contrato: obtenerTexto(contrato.contrato) || "No disponible",
          producto:
            obtenerTexto(contrato.nombre_producto) ||
            obtenerTexto(contrato.descripcion_producto) ||
            obtenerTexto(contrato.producto) ||
            obtenerTexto(contrato.descripcion_grupal) ||
            "Plan empresarial",
        }))
      : await obtenerPlanesExequiales(contratosExequiales);

    const contratosTexto = planesSolicitud
      .map((plan) => plan.contrato)
      .join(" / ");

    const productosTexto = planesSolicitud
      .map((plan) => plan.producto)
      .join(" / ");

    const datosDoc = JSON.stringify([
      {
        solicitud: "Declaración de renta",
        tipoSolicitud: esSolicitudEmpresarial ? "empresarial" : "normal",
        nombre: datosTitular.nombre,
        tipoIdentificacion: datosTitular.tipoIdentificacion,
        identificacion: datosTitular.identificacion,
        contratos: contratosTexto,
        productos: productosTexto,
        formaEntrega: "Correo",
        correoRelacionado: datosTitular.email,
        contacto: datosTitular.contacto,
      },
    ]);

    await registrarSolicitudEnSheets({
      fechaCreacion: obtenerFechaRegistroTexto(),
      usuCreacion: identificacionTexto,
      codigoDoc: codigoSolicitud,
      tipoDoc: "Declaración de renta",
      quienNecesitaDoc: "Titular",
      dirigidoADoc: "No aplica",
      datosDoc,
    });

    await registrarSolicitudNivel2DeclaracionRenta({
      fechaSolicitud: obtenerFechaRegistroTexto(),
      cedula: datosTitular.identificacion || identificacionTexto,
      nombre: datosTitular.nombre,
      correo: datosTitular.email,
      codigoSolicitud,
      contratosTexto,
      contacto: datosTitular.contacto,
    });

    await enviarCorreoConfirmacion({
      destinatario: datosTitular.email,
      nombre: datosTitular.nombre,
      identificacion: datosTitular.identificacion,
      contratosTexto,
      productosTexto,
      codigoSolicitud,
    });

    return NextResponse.json(
      {
        ok: true,
        message:
          "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. La respuesta será enviada al correo electrónico registrado dentro de los próximos tres (3) días hábiles.",
        codigoSolicitud,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error registrando solicitud de Declaración de renta:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          "No fue posible registrar la solicitud de Declaración de renta en este momento.",
      },
      { status: 500 }
    );
  }
}