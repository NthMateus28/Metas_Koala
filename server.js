import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;
const ACCESS_TOKEN = '2cfb95d0340243e069d3019405fe65fbf85cd88b'; // ideal usar variável de ambiente

const detalhesPath = path.resolve('./cache_detalhes.json');
const cacheNfePath = path.resolve('./cache_nfe.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Função que retorna a última data do cache de detalhes +1 dia
async function getUltimaDataDoCacheDetalhes() {
  try {
    const raw = await fs.readFile(detalhesPath, 'utf-8');
    const cache = JSON.parse(raw);

    const datas = Object.values(cache)
      .map(entry => new Date(entry?.data?.dataEmissao))
      .filter(d => !isNaN(d));

    if (datas.length === 0) return null;

    const maisRecente = new Date(Math.max(...datas));
    maisRecente.setDate(maisRecente.getDate());
    return maisRecente.toISOString().split('T')[0]; // yyyy-mm-dd
  } catch (e) {
    console.warn('⚠️ Nenhum ou erro ao ler cache_detalhes.json');
    return null;
  }
}

// Endpoint para buscar notas
app.get('/api/nfe', async (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const dataFinal = req.query.fim || hoje;

  console.log(dataFinal);

  let dataInicial = await getUltimaDataDoCacheDetalhes();
  if (!dataInicial) {
    const d = new Date();
    dataInicial = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const limite = 100;
  let pagina = 1;
  let todasNotas = [];
  let continuar = true;
  let ultimaDataEncontrada = dataInicial;

  console.log(`📅 Buscando NFs de ${dataInicial} até ${dataFinal}`);

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
        console.error(`❌ Erro na página ${pagina}:
${textoErro.slice(0, 300)}`);
        break;
      }

      const json = await response.json();
      const notas = json.data || [];

      todasNotas = todasNotas.concat(notas);

      for (const nf of notas) {
        const dataEmissao = nf?.data?.dataEmissao;
        if (dataEmissao && dataEmissao > ultimaDataEncontrada) {
          ultimaDataEncontrada = dataEmissao;
        }
      }

      console.log(`📄 Página ${pagina} retornou ${notas.length} notas`);

      if (notas.length < limite) {
        continuar = false;
      } else {
        pagina++;
      }
    }

    if (todasNotas.length > 0) {
      const novoCache = {
        notas: todasNotas,
        ultimaDataBusca: ultimaDataEncontrada
      };
      await fs.writeFile(cacheNfePath, JSON.stringify(novoCache, null, 2));
      console.log(`🗃️ Atualizado cache_nfe.json com ${todasNotas.length} notas e data ${ultimaDataEncontrada}`);
    } else {
      console.log('📭 Nenhuma nova nota encontrada.');
    }

    res.json({ data: todasNotas });
  } catch (error) {
    console.error('🔥 Erro ao buscar dados do Bling:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do Bling' });
  }
});

// Endpoint: Detalhes de uma NF por ID
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
      console.error(`❌ Erro ${status} ao buscar nota ${idNota}:
`, text.slice(0, 300));
      return res.status(status).json({ error: `Erro ao buscar nota ${idNota}` });
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.warn(`⚠️ Resposta inesperada (não JSON) da nota ${idNota}:
`, text.slice(0, 300));
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

// GET: Lê cache de detalhes
app.get('/api/nfe-cache', async (req, res) => {
  try {
    const data = await fs.readFile(detalhesPath, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    res.json({});
  }
});

// POST: Salva detalhes no cache
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

// Inicializa servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

import { atualizarNotasCompletas } from './scrypts/atualizarNotas.js';

// Atualiza automaticamente ao subir o servidor
(async () => {
  await new Promise(resolve => setTimeout(resolve, 1500)); // espera o server subir completamente
  await atualizarNotasCompletas();
})();
