import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const PORT = 3000;
const ACCESS_TOKEN = 'd424e686f74e76210ff3454f0b5fecf1c254fadc'; // ideal usar variável de ambiente
const detalhesPath = path.resolve('./cache_detalhes.json');

app.use(cors());
import bodyParser from 'body-parser'; // adicione no topo se ainda não estiver

// 👇 Adiciona suporte a JSON grande (até 10MB, pode ajustar conforme necessário)
app.use(bodyParser.json({ limit: '10mb' }));
// ✅ Endpoint: Lista de NFs do período (com paginação)
app.get('/api/nfe', async (req, res) => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');

  const dataInicial = req.query.inicio || `${ano}-${mes}-01`;
  const dataFinal = req.query.fim || `${ano}-${mes}-${dia}`;

  const limite = 100;
  let pagina = 1;
  let todasNotas = [];
  let continuar = true;

  console.log(`📅 Buscando notas de ${dataInicial} até ${dataFinal}`);

  try {
    while (continuar) {
      const url = `https://api.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=${limite}&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}`;
      console.log(`➡️ Requisição para URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        const textoErro = await response.text();
        console.error(`❌ Erro na página ${pagina}:\n${textoErro.slice(0, 300)}`);
        break;
      }

      const json = await response.json();
      const notas = json.data || [];

      todasNotas = todasNotas.concat(notas);

      console.log(`📄 Página ${pagina} retornou ${notas.length} notas`);

      if (notas.length < limite) {
        continuar = false;
      } else {
        pagina++;
      }
    }

    res.json({ data: todasNotas });
  } catch (error) {
    console.error('🔥 Erro ao buscar dados do Bling:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do Bling' });
  }
});

// ✅ Endpoint: Detalhes de uma NF por ID com logs e controle de redirect
app.get('/api/nfe/:id', async (req, res) => {
  const idNota = req.params.id;
  const url = `https://api.bling.com.br/Api/v3/nfe/${idNota}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: 'application/json'
      },
      redirect: 'manual'
    });

    const status = response.status;
    const contentType = response.headers.get('content-type');
    const location = response.headers.get('location');

    console.log(`🔎 Buscando nota ${idNota} - Status: ${status}`);

    if (status === 302) {
      return res.status(502).json({ error: `A API do Bling redirecionou a requisição da nota ${idNota}`, redirect: location });
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Erro ${status} ao buscar nota ${idNota}:\n`, text.slice(0, 300));
      return res.status(status).json({ error: `Erro ao buscar nota ${idNota}` });
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.warn(`⚠️ Resposta inesperada (não JSON) da nota ${idNota}:\n`, text.slice(0, 300));
      return res.status(502).json({ error: 'Resposta inesperada da API do Bling' });
    }

    const data = await response.json();
    console.log(`✅ Nota ${idNota} obtida com sucesso`);
    res.json(data);
  } catch (error) {
    console.error(`🔥 Erro inesperado ao buscar detalhes da NF ${idNota}:`, error);
    res.status(500).json({ error: 'Erro inesperado no servidor proxy' });
  }
});

// ✅ Endpoint: GET do cache local de detalhes
app.get('/api/nfe-cache', async (req, res) => {
  try {
    const data = await fs.readFile(detalhesPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json({});
  }
});

// ✅ Endpoint: POST para salvar/atualizar cache local
app.post('/api/nfe-cache', async (req, res) => {
  try {
    const novos = req.body;
    const atual = await fs.readFile(detalhesPath, 'utf-8').then(JSON.parse).catch(() => ({}));
    for (const nf of novos) {
      if (nf?.data?.id) atual[nf.data.id] = nf;
    }
    await fs.writeFile(detalhesPath, JSON.stringify(atual, null, 2));
    res.json({ sucesso: true });
  } catch (e) {
    console.error('❌ Erro ao salvar cache de detalhes:', e);
    res.status(500).json({ erro: 'Erro ao salvar cache de detalhes' });
  }
});

// ✅ Inicializa servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
