import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const ACCESS_TOKEN = '3a96f309f108e91be1538becdcb2d4df9a96bf45';

const detalhesPath = path.resolve('./cache_detalhes.json');
const cacheNfePath = path.resolve('./cache_nfe.json');

app.use(cors());
app.use(express.static(path.resolve('./public')));
app.use(bodyParser.json({ limit: '10mb' }));

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
    return maisRecente.toISOString().split('T')[0];
  } catch (e) {
    console.warn('⚠️ Nenhum ou erro ao ler cache_detalhes.json');
    return null;
  }
}

app.get('/api/nfe', async (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];
  const dataFinal = req.query.fim || hoje;
  const dataInicial = '2025-07-01'; // ← fixado em julho

  async function buscarNotasPorTipo(tipo) {
    const limite = 100;
    let pagina = 1;
    let todasNotas = [];
    let continuar = true;

    console.log(`📦 Buscando notas tipo ${tipo === 1 ? 'SAÍDA' : 'ENTRADA'} de ${dataInicial} até ${dataFinal}`);

    while (continuar) {
      const url = `https://api.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=${limite}&tipo=${tipo}&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}`;
      console.log(`🌐 Requisição URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        const textoErro = await response.text();
        console.error(`❌ Erro na página ${pagina} (tipo ${tipo}):\n${textoErro.slice(0, 300)}`);
        break;
      }

      const json = await response.json();
      const notas = json.data || [];

      todasNotas = todasNotas.concat(notas);
      console.log(`✅ Página ${pagina} (tipo ${tipo}) retornou ${notas.length} notas`);

      if (notas.length < limite) {
        continuar = false;
      } else {
        pagina++;
      }
    }

    return todasNotas;
  }

  try {
    // 🔄 Buscar ambos os tipos de notas
    const [notasSaida, notasEntrada] = await Promise.all([
      buscarNotasPorTipo(1),
      buscarNotasPorTipo(0)
    ]);

    const todasNotas = [...notasSaida, ...notasEntrada];

    // 💾 Salvar no cache
    const ultimaDataBusca = dataFinal;
    const novoCache = {
      notas: todasNotas,
      ultimaDataBusca
    };

    await fs.writeFile(cacheNfePath, JSON.stringify(novoCache, null, 2));
    console.log(`🗃️ Cache atualizado com ${todasNotas.length} notas até ${ultimaDataBusca}`);

    res.json({ data: todasNotas });
  } catch (error) {
    console.error('🔥 Erro ao buscar dados do Bling:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do Bling' });
  }
});

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

    console.log(`Buscando nota ${idNota} - Status: ${status}`);

    if (status === 302) {
      return res.status(502).json({ error: `A API do Bling redirecionou a requisição da nota ${idNota}`, redirect: location });
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`Erro ${status} ao buscar nota ${idNota}:
`, text.slice(0, 300));
      return res.status(status).json({ error: `Erro ao buscar nota ${idNota}` });
    }

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.warn(`Resposta inesperada (não JSON) da nota ${idNota}:
`, text.slice(0, 300));
      return res.status(502).json({ error: 'Resposta inesperada da API do Bling' });
    }

    const data = await response.json();
    console.log(`Nota ${idNota} obtida com sucesso`);
    res.json(data);
  } catch (error) {
    console.error(`Erro inesperado ao buscar detalhes da NF ${idNota}:`, error);
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
    console.error('Erro ao salvar cache de detalhes:', e);
    res.status(500).json({ erro: 'Erro ao salvar cache de detalhes' });
  }
});

// Serve arquivos estáticos da pasta "pages"
app.use(express.static(path.resolve('./pages')));

// Rota raiz carrega a página index_meta_vendas.html
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'public/pages/index_meta_vendas.html'));
});


// Inicializa servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

import { atualizarNotasCompletas } from './public/scrypts/atualizarNotas.js';

// Atualiza automaticamente ao subir o servidor
(async () => {
  await new Promise(resolve => setTimeout(resolve, 1500)); // espera o server subir completamente
  await atualizarNotasCompletas();
})();

// Atualiza notas a cada 1 hora
setInterval(async () => {
  console.log('Executando atualização automática de notas (intervalo de 1h)...');
  try {
    await atualizarNotasCompletas();
    console.log('Atualização concluída com sucesso!');
  } catch (err) {
    console.error('Erro na atualização automática:', err);
  }
}, 1000 * 60 * 60); // 1 hora

// GET: Atualização manual via botão
app.get('/api/atualizar-notas', async (req, res) => {
  try {
    await atualizarNotasCompletas();
    res.json({ sucesso: true, mensagem: 'Notas atualizadas com sucesso!' });
  } catch (err) {
    console.error('Erro na atualização manual:', err);
    res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar notas.' });
  }
});