import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { google } from "googleapis";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContratoKaring = Record<string, unknown>;

type PlanExequialSolicitud = {
  contrato: string;
  producto: string;
};

type ContratoMoroso = {
  contrato: string;
  producto: string;
  cantidadRegistrosCartera: number;
};

type FallecidoSolicitud = {
  nombreCompleto: string;
  identificacion: string;
  fechaFallecimiento: string;
};



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

function contratoEstaCancelado(contrato: ContratoKaring) {
  const renovacion = String(contrato.renovacion ?? "")
    .trim()
    .toUpperCase();

  return renovacion === "C";
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

function contratoTieneCartera(contrato: ContratoKaring) {
    const carteraControl = contrato.cartera_control;
  
    if (!Array.isArray(carteraControl)) {
      return false;
    }
  
    return carteraControl.length > 0;
  }
  
  function obtenerCantidadCartera(contrato: ContratoKaring) {
    const carteraControl = contrato.cartera_control;
  
    if (!Array.isArray(carteraControl)) {
      return 0;
    }
  
    return carteraControl.length;
  }


  function normalizarDocumento(documento: string | null) {
    if (!documento) {
      return "";
    }
  
    return documento.replace(/\D/g, "").trim();
  }
  
  function obtenerNombreCompletoPersona(persona: Record<string, unknown>) {
    return [
      obtenerTexto(persona.primer_nombre),
      obtenerTexto(persona.segundo_nombre),
      obtenerTexto(persona.primer_apellido),
      obtenerTexto(persona.segundo_apellido),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  
  function formatearFechaCorta(fechaTexto: string | null) {
    if (!fechaTexto) {
      return "";
    }
  
    const fechaLimpia = fechaTexto.trim();
  
    const coincidenciaIso = fechaLimpia.match(/^(\d{4})-(\d{2})-(\d{2})/);
  
    if (coincidenciaIso) {
      const [, anio, mes, dia] = coincidenciaIso;
      return `${dia}/${mes}/${anio}`;
    }
  
    const coincidenciaLatina = fechaLimpia.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  
    if (coincidenciaLatina) {
      const [, dia, mes, anio] = coincidenciaLatina;
      return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${anio}`;
    }
  
    return "";
  }
  
  function obtenerFallecidoDesdeDetalle(
    detalleContrato: unknown,
    documentoFallecido: string,
    identificacionTitular: string
  ): FallecidoSolicitud | null {
    if (
      !detalleContrato ||
      typeof detalleContrato !== "object" ||
      Array.isArray(detalleContrato)
    ) {
      return null;
    }
  
    const asegurados = (detalleContrato as Record<string, unknown>).asegurados;
  
    if (!Array.isArray(asegurados)) {
      return null;
    }
  
    const documentoBuscado = normalizarDocumento(documentoFallecido);
  
    const coincidencias = asegurados.filter((asegurado) => {
      if (
        !asegurado ||
        typeof asegurado !== "object" ||
        Array.isArray(asegurado)
      ) {
        return false;
      }
  
      const persona = asegurado as Record<string, unknown>;
  
      const identificacion = obtenerTexto(persona.identificacion);
      const fechaFallecio = obtenerTexto(persona.fecha_fallecio);
  
      if (!identificacion) {
        return false;
      }
  
      if (normalizarDocumento(identificacion) !== documentoBuscado) {
        return false;
      }
  
      return Boolean(fechaFallecio);
    });
  
    if (coincidencias.length === 0) {
      return null;
    }
  
    const registro = coincidencias[coincidencias.length - 1] as Record<
      string,
      unknown
    >;
  
    const nombreCompleto = obtenerNombreCompletoPersona(registro);
    const identificacion = obtenerTexto(registro.identificacion);
    const fechaFallecio = obtenerTexto(registro.fecha_fallecio);
  
    if (!nombreCompleto || !identificacion || !fechaFallecio) {
      return null;
    }
  
    return {
      nombreCompleto,
      identificacion,
      fechaFallecimiento: formatearFechaCorta(fechaFallecio),
    };
  }
  
  async function obtenerFallecidoEnContratos(params: {
    contratosExequiales: ContratoKaring[];
    identificacionTitular: string;
    documentoFallecido: string;
  }) {
    const token = await obtenerToken();
  
    for (const contrato of params.contratosExequiales) {
      const numeroContrato = obtenerTexto(contrato.contrato);
  
      if (!numeroContrato) {
        continue;
      }
  
      const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);
  
      const fallecido = obtenerFallecidoDesdeDetalle(
        detalleContrato,
        params.documentoFallecido,
        params.identificacionTitular
      );
  
      if (!fallecido) {
        continue;
      }
  
      return fallecido;
    }
  
    return null;
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

async function obtenerContratosMorosos(contratosExequiales: ContratoKaring[]) {
    const token = await obtenerToken();
    const contratosMorosos: ContratoMoroso[] = [];
  
    for (const contrato of contratosExequiales) {
      const numeroContrato = obtenerTexto(contrato.contrato);
  
      if (!numeroContrato) {
        continue;
      }
  
      if (!contratoTieneCartera(contrato)) {
        continue;
      }
  
      const detalleContrato = await consultarContratoPorNumero(numeroContrato, token);
  
      contratosMorosos.push({
        contrato: numeroContrato,
        producto: obtenerNombreProductoDesdeDetalle(detalleContrato),
        cantidadRegistrosCartera: obtenerCantidadCartera(contrato),
      });
    }
  
    return contratosMorosos;
  }

function generarCodigoSolicitud() {
  const fecha = new Date();

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  const uuid = crypto.randomUUID().replaceAll("-", "").toUpperCase();

  return `GAS-${anio}${mes}${dia}-${uuid.slice(0, 6)}-${uuid.slice(6, 12)}-${uuid.slice(12, 18)}`;
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

async function registrarSolicitudNivel2CertificadoGastos(datos: {
  fechaSolicitud: string;
  lugarRetiro: string;
  cedulaTitular: string;
  nombreTitular: string;
  cedulaFallecido: string;
  nombreFallecido: string;
  fechaFallecimiento: string;
  dirigidoA: string;
  observacion: string;
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
    range: "'8. Certificado de gastos'!A1",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          datos.fechaSolicitud,
          "APLICATIVO WEB",
          datos.lugarRetiro,
          "",
          datos.cedulaTitular,
          datos.nombreTitular,
          datos.cedulaFallecido,
          datos.nombreFallecido,
          datos.fechaFallecimiento,
          "",
          datos.dirigidoA,
          datos.observacion,
        ],
      ],
    },
  });
}

function generarHtmlSolicitudCertificadoGastos(datos: {
  nombre: string;
  identificacion: string;
  contratosTexto: string;
  productosTexto: string;
  destinoGastos: string;
  entidadFinanciera: string;
  cedulaFallecido: string;
  nombreFallecido: string;
  fechaFallecimiento: string;
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
                      <strong style="color:#002869;">Certificado de gastos servicios funerarios</strong>.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px; background:#f5fafd; border:1px solid #d8edf8; border-radius:12px;">
                      <tr>
                        <td style="padding:18px 22px; text-align:left; color:#374151; font-size:14px; line-height:1.7;">
                          <strong style="color:#002869;">Nombre:</strong> ${datos.nombre}<br />
                          <strong style="color:#002869;">Identificación:</strong> ${datos.identificacion}<br />
                          <strong style="color:#002869;">Contrato(s):</strong> ${datos.contratosTexto}<br />
                          <strong style="color:#002869;">Producto(s):</strong> ${datos.productosTexto}<br />
                          <strong style="color:#002869;">Dirigido a:</strong> ${datos.destinoGastos}<br />
                          ${
                            datos.entidadFinanciera
                              ? `<strong style="color:#002869;">Entidad:</strong> ${datos.entidadFinanciera}<br />`
                              : ""
                          }
                          <strong style="color:#002869;">Identificación del fallecido:</strong> ${datos.cedulaFallecido}<br />
                          <strong style="color:#002869;">Nombre del fallecido:</strong> ${datos.nombreFallecido}<br />
                          <strong style="color:#002869;">Fecha de fallecimiento:</strong> ${datos.fechaFallecimiento || "Pendiente por validar"}
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

async function enviarCorreoConfirmacion(datos: {
    destinatario: string;
    nombre: string;
    identificacion: string;
    contratosTexto: string;
    productosTexto: string;
    codigoSolicitud: string;
    destinoGastos: string;
    entidadFinanciera: string;
    cedulaFallecido: string;
    nombreFallecido: string;
    fechaFallecimiento: string;
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
      subject: "Solicitud de Certificado de gastos servicios funerarios registrada",
      html: generarHtmlSolicitudCertificadoGastos({
        nombre: datos.nombre,
        identificacion: datos.identificacion,
        contratosTexto: datos.contratosTexto,
        productosTexto: datos.productosTexto,
        destinoGastos: datos.destinoGastos,
        entidadFinanciera: datos.entidadFinanciera,
        cedulaFallecido: datos.cedulaFallecido,
        nombreFallecido: datos.nombreFallecido,
        fechaFallecimiento: datos.fechaFallecimiento,
      }),
    });
  }

  async function enviarCorreoContratosMorosos(datos: {
    destinatario: string;
    nombre: string;
    identificacion: string;
    contratosMorosos: ContratoMoroso[];
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
  
    const filasContratos = datos.contratosMorosos
      .map(
        (contrato) => `
          <tr>
            <td style="border:1px solid #ddd;padding:8px;">${contrato.contrato}</td>
            <td style="border:1px solid #ddd;padding:8px;">${contrato.producto}</td>
            <td style="border:1px solid #ddd;padding:8px;text-align:center;">${contrato.cantidadRegistrosCartera}</td>
          </tr>
        `
      )
      .join("");
  
    await transporter.sendMail({
      from: `"Cotrafa Social" <${from}>`,
      to: datos.destinatario,
      subject: "Información sobre tu solicitud de Certificado de gastos servicios funerarios",
      html: `
        <p>Cordial saludo,</p>
  
        <p>
          Recibimos tu solicitud de <strong>Certificado de gastos servicios funerarios</strong>.
          Sin embargo, actualmente registras obligaciones pendientes en uno o más contratos.
        </p>
  
        <p>
          <strong>Nombre:</strong> ${datos.nombre}<br />
          <strong>Identificación:</strong> ${datos.identificacion}
        </p>
  
        <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;">Contrato</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:left;">Producto</th>
              <th style="border:1px solid #ddd;padding:8px;text-align:center;">Registros en cartera</th>
            </tr>
          </thead>
          <tbody>
            ${filasContratos}
          </tbody>
        </table>
  
        <p>
          Para continuar con la solicitud, te invitamos a comunicarte con nuestro equipo de atención
          y normalizar la información correspondiente.
        </p>
  
        <p>
          Atentamente,<br />
          <strong>Cotrafa Social</strong>
        </p>
      `,
    });
  }


export async function POST(request: Request) {
  try {
    const {
      modo,
      identificacion,
      destinoGastos,
      entidadFinanciera,
      cedulaFallecido,
      lugarRetiro,
    } = await request.json();


    

    if (!identificacion || !String(identificacion).trim()) {
      return NextResponse.json(
        { ok: false, message: "Debe ingresar un número de documento." },
        { status: 400 }
      );
    }
      
      if (!cedulaFallecido || !String(cedulaFallecido).trim()) {
        return NextResponse.json(
          { ok: false, message: "Debe ingresar la identificación del fallecido." },
          { status: 400 }
        );
      }

      const contratos = await consultarContratos(String(identificacion).trim());

      const contratosExequiales = obtenerContratosExequiales(contratos);

      const contratosEmpresarialesActivos =
        obtenerContratosEmpresarialesActivos(contratos);

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

    let fallecidoRelacionado: FallecidoSolicitud | null = null;

  if (!esSolicitudEmpresarial) {
    fallecidoRelacionado = await obtenerFallecidoEnContratos({
      contratosExequiales,
      identificacionTitular: String(identificacion).trim(),
      documentoFallecido: String(cedulaFallecido).trim(),
    });

    if (!fallecidoRelacionado) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "La identificación ingresada no corresponde a un beneficiario fallecido asociado al contrato.",
        },
        { status: 422 }
      );
    }
  }

  if (modo === "validar-fallecido") {
    return NextResponse.json(
      {
        ok: true,
        message: "Fallecido validado correctamente.",
        fallecido: fallecidoRelacionado,
      },
      { status: 200 }
    );
  }

  if (!destinoGastos || !String(destinoGastos).trim()) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debe seleccionar a quién va dirigido el certificado.",
      },
      { status: 400 }
    );
  }
  
  if (
    String(destinoGastos).trim() === "entidad-financiera" &&
    (!entidadFinanciera || !String(entidadFinanciera).trim())
  ) {
    return NextResponse.json(
      { ok: false, message: "Debe ingresar alguna entidad." },
      { status: 400 }
    );
  }
  
  const lugarRetiroTexto = String(lugarRetiro || "").trim();
  
  if (!["Bello", "Rionegro"].includes(lugarRetiroTexto)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Debe seleccionar el lugar donde desea retirar el certificado.",
      },
      { status: 400 }
    );
  }

    if (!esSolicitudEmpresarial) {
      const contratosMorosos = await obtenerContratosMorosos(contratosExequiales);
    
      if (contratosMorosos.length > 0) {
        await enviarCorreoContratosMorosos({
          destinatario: datosTitular.email,
          nombre: datosTitular.nombre,
          identificacion: datosTitular.identificacion,
          contratosMorosos,
        });
    
        return NextResponse.json(
          {
            ok: true,
            estado: "moroso",
            message:
              "Tu solicitud fue recibida.\n\nHemos enviado información detallada al correo electrónico registrado.",
          },
          { status: 200 }
        );
      }
    }

    const codigoSolicitud = generarCodigoSolicitud();

    const nombreFallecidoSolicitud =
  fallecidoRelacionado?.nombreCompleto || "Pendiente por validar";

const fechaFallecimientoSolicitud =
  fallecidoRelacionado?.fechaFallecimiento || "";

    const planesExequiales = esSolicitudEmpresarial
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

    const contratosTexto = planesExequiales
      .map((plan) => plan.contrato)
      .join(" / ");

    const productosTexto = planesExequiales
      .map((plan) => plan.producto)
      .join(" / ");

      const entidadFinancieraTexto = String(entidadFinanciera || "").trim();

      const destinoGastosTexto =
        String(destinoGastos).trim() === "interesado"
          ? "A quien pueda interesar"
          : entidadFinancieraTexto || "Entidad no especificada";

    const datosDoc = JSON.stringify([
      {
        solicitud: "Certificado de gastos servicios funerarios",
        tipoSolicitud: esSolicitudEmpresarial ? "empresarial" : "normal",
        nombre: datosTitular.nombre,
        tipoIdentificacion: datosTitular.tipoIdentificacion,
        identificacion: datosTitular.identificacion,
        contratos: contratosTexto,
        productos: productosTexto,
        destinoGastos: destinoGastosTexto,
        entidadFinanciera: entidadFinancieraTexto,
        lugarRetiro: lugarRetiroTexto,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
        correoRelacionado: datosTitular.email,
    },
    ]);

      await registrarSolicitudEnSheets({
        fechaCreacion: obtenerFechaRegistroTexto(),
        usuCreacion: String(identificacion).trim(),
        codigoDoc: codigoSolicitud,
        tipoDoc: "Certificado de gastos servicios funerarios",
        quienNecesitaDoc: "Titular",
        dirigidoADoc: destinoGastosTexto,
        datosDoc,
      });

      await registrarSolicitudNivel2CertificadoGastos({
        fechaSolicitud: obtenerFechaRegistroTexto(),
        lugarRetiro: lugarRetiroTexto.toLocaleUpperCase("es-CO"),
        cedulaTitular:
          datosTitular.identificacion || String(identificacion).trim(),
        nombreTitular: datosTitular.nombre,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
        dirigidoA: destinoGastosTexto,
        observacion: `${datosTitular.email} / ${codigoSolicitud}`,
      });

      await enviarCorreoConfirmacion({
        destinatario: datosTitular.email,
        nombre: datosTitular.nombre,
        identificacion: datosTitular.identificacion,
        contratosTexto,
        productosTexto,
        codigoSolicitud,
        destinoGastos: destinoGastosTexto,
        entidadFinanciera: entidadFinancieraTexto,
        cedulaFallecido: String(cedulaFallecido).trim(),
        nombreFallecido: nombreFallecidoSolicitud,
        fechaFallecimiento: fechaFallecimientoSolicitud,
      });


      return NextResponse.json(
        {
          ok: true,
          message:
            "Solicitud enviada exitosamente.\n\nTu solicitud ha sido recibida y será validada por nuestro equipo. Podrás retirarla físicamente en la sede seleccionada después de transcurridos tres (3) días hábiles.",
          codigoSolicitud,
        },
        { status: 200 }
      );
  } catch (error) {
    console.error("Error registrando solicitud de Certificado de gastos servicios funerarios:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "No fue posible registrar la solicitud de certificado de gastos servicios funerarios en este momento.",
      },
      { status: 500 }
    );
  }
}