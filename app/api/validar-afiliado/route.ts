import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function obtenerToken() {
    const authUrl = process.env.KARING_AUTH_URL;
    const usuario = process.env.KARING_USER;
    const clave = process.env.KARING_PASSWORD;
  
    if (!authUrl || !usuario || !clave) {
      throw new Error("Faltan variables de entorno de autenticación.");
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
      throw new Error(
        `No fue posible autenticar. Status: ${response.status}. Respuesta: ${textoRespuesta}`
      );
    }
  
    const token = textoRespuesta.replace(/^"|"$/g, "").trim();
  
    if (!token) {
      throw new Error("La API autenticó, pero no devolvió token.");
    }
  
    return token;
  }


  async function consultarTercero(tercero: string, token: string) {
    const tercerosUrl = process.env.KARING_TERCERO_URL;
  
    if (!tercerosUrl) {
      throw new Error("Falta configurar la URL de terceros.");
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
  
    if (!response.ok) {
      return null;
    }
  
    if (!textoRespuesta || textoRespuesta.trim() === "") {
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
  
    const terceroCategoria = String(tercero.tercero_categoria ?? "")
      .trim()
      .toUpperCase();
  
    const tipoOrganizacion = String(tercero.tipo_organizacion ?? "")
      .trim()
      .toUpperCase();
  
    return estado === "A" && (terceroCategoria === "2" || tipoOrganizacion === "2");
  }

  type ContratoKaring = Record<string, unknown>;

  function obtenerFechaMasAntiguaAfiliacion(contratos: ContratoKaring[]) {
    const fechas = contratos
      .map((contrato) => contrato.fecha_afiliacion)
      .filter((fecha): fecha is string => typeof fecha === "string" && fecha.trim() !== "")
      .map((fecha) => new Date(fecha))
      .filter((fecha) => !isNaN(fecha.getTime()));
  
    if (fechas.length === 0) {
      return null;
    }
  
    const fechaMasAntigua = fechas.reduce((fechaMenor, fechaActual) => {
      return fechaActual < fechaMenor ? fechaActual : fechaMenor;
    });
  
    return fechaMasAntigua;
  }

  function obtenerAnioAfiliacionMasAntiguo(contratos: ContratoKaring[]) {
    const fechaMasAntigua = obtenerFechaMasAntiguaAfiliacion(contratos);

    if (!fechaMasAntigua) {
      return null;
    }

    return fechaMasAntigua.getFullYear();
  }

  function obtenerTexto(valor: unknown) {
    return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
  }

  const NIT_COTRAFA_SOCIAL = "811017024";

function normalizarNit(valor: unknown) {
  return String(valor || "").replace(/\D/g, "").trim();
}

function contratoEsEmpresarial(contrato: ContratoKaring) {
  const nitGrupal = normalizarNit(contrato.nit_grupal);

  return nitGrupal !== "" && nitGrupal !== NIT_COTRAFA_SOCIAL;
}

  function obtenerTipoIdentificacionTexto(codigo: string | null) {
    const tipos: Record<string, string> = {
      "31": "cédula de ciudadanía",
      "13": "cédula de ciudadanía",
      "12": "tarjeta de identidad",
      "11": "registro civil",
      "22": "cédula de extranjería",
    };
  
    if (!codigo) {
      return null;
    }
  
    return tipos[codigo.trim()] || codigo.trim();
  }

  function contratoEstaActivo(contrato: ContratoKaring) {
    const renovacion = String(contrato.renovacion ?? "")
      .trim()
      .toUpperCase();
  
    return renovacion !== "C";
  }

 
  
  function obtenerDatosTitularParaCertificado(contratos: ContratoKaring[]) {
    const contratoBase = contratos[0];
  
    const anioAfiliacion = obtenerAnioAfiliacionMasAntiguo(contratos);
  
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
      anioAfiliacion,
    };
  }

  async function validarProveedorPorTercero(
    identificacion: string,
    token: string
  ) {
    const tercero = await consultarTercero(identificacion, token);
  
    return terceroEsProveedorValido(tercero);
  }

  export async function POST(request: Request) {
    try {
      const { identificacion } = await request.json();
  
      if (!identificacion || !String(identificacion).trim()) {
        return NextResponse.json(
          {
            ok: false,
            message: "Debe ingresar un número de documento.",
          },
          { status: 400 }
        );
      }
  
      const identificacionTexto = String(identificacion).trim();
  
      const contratosUrl = process.env.KARING_CONTRATOS_URL;
  
      if (!contratosUrl) {
        return NextResponse.json(
          {
            ok: false,
            message: "Falta configurar la URL de consulta de contratos.",
          },
          { status: 500 }
        );
      }
  
      const token = await obtenerToken();

      const esProveedorValido = await validarProveedorPorTercero(
        identificacionTexto,
        token
      );
      
      const urlConsulta = new URL(contratosUrl);

      urlConsulta.searchParams.set("identificacion", identificacionTexto);
  
      const contratosResponse = await fetch(urlConsulta.toString(), {
        method: "GET",
        headers: {
          "Authorization-Token": token,
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
        },
      });
  
      const textoContratos = await contratosResponse.text();
  
      let contratosData: unknown;
  
      try {
        contratosData = JSON.parse(textoContratos);
      } catch {
        contratosData = null;
      }
  
      if (!contratosResponse.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: "No fue posible consultar la información del afiliado.",
          },
          { status: contratosResponse.status }
        );
      }
  
      let esAfiliadoValido = false;

      if (Array.isArray(contratosData) && contratosData.length > 0) {
        const contratosActivos = contratosData.filter(contratoEstaActivo);

        if (contratosActivos.length > 0) {
          const datosTitular =
            obtenerDatosTitularParaCertificado(contratosActivos);

          esAfiliadoValido = Boolean(
            datosTitular.nombre &&
              datosTitular.tipoIdentificacion &&
              datosTitular.identificacion &&
              datosTitular.anioAfiliacion
          );
        }
      }

      if (esAfiliadoValido && esProveedorValido) {
        return NextResponse.json({
          ok: true,
          tipoUsuario: "afiliado-proveedor",
          message: "Afiliado y proveedor validado correctamente.",
        });
      }

      if (esAfiliadoValido) {
        return NextResponse.json({
          ok: true,
          tipoUsuario: "afiliado",
          message: "Afiliado validado correctamente.",
        });
      }

      if (esProveedorValido) {
        return NextResponse.json({
          ok: true,
          tipoUsuario: "proveedor",
          message: "Proveedor validado correctamente.",
        });
      }

      return NextResponse.json(
        {
          ok: false,
          message:
            "No encontramos información activa asociada al documento ingresado.",
        },
        { status: 404 }
      );

    } catch (error) {
      console.error("Error validando afiliado:", error);
  
      return NextResponse.json(
        {
          ok: false,
          message:
            "No fue posible validar la información en este momento. Intenta nuevamente más tarde.",
        },
        { status: 500 }
      );
    }
  }