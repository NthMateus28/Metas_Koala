import fetch from 'node-fetch';
import fs from 'fs';

export async function atualizarNotasCompletas() {
  try {
    console.log('🔄 Buscando novas notas fiscais...');

    // 1. Buscar lista geral de notas
    const url = 'https://metas-koala.onrender.com/api/nfe';
    const res = await fetch(url);
    const { data: notas } = await res.json();

    // 2. Obter cache atual
    const cacheRes = await fetch('https://metas-koala.onrender.com/api/nfe-cache');
    const cacheAtual = await cacheRes.json();

    // 3. Identificar notas ainda não detalhadas
    const idsRestantes = notas
      .map(nf => nf?.id)
      .filter(id => id && !cacheAtual[id]);

    console.log(`🧾 ${idsRestantes.length} notas novas para detalhar`);

    // 4. Buscar detalhes com validação
    const novosDetalhes = [];
    let erros = 0;
    let redirects = 0;

    for (const id of idsRestantes) {
      try {
        const resposta = await fetch(`https://metas-koala.onrender.com/api/nfe/${id}`);
        const status = resposta.status;

        if (status === 302) {
          redirects++;
          console.warn(`↪️ Nota ${id} redirecionada (302), ignorada`);
          continue;
        }

        const contentType = resposta.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          erros++;
          console.warn(`⚠️ Nota ${id} não retornou JSON. Tipo: ${contentType}`);
          continue;
        }

        const detalhe = await resposta.json();
        if (detalhe?.data?.id) {
          novosDetalhes.push(detalhe);
          console.log(`✅ Detalhe da nota ${id} carregado`);
        } else {
          erros++;
          console.warn(`⚠️ Detalhe da nota ${id} sem estrutura válida`);
        }
      } catch (e) {
        erros++;
        console.error(`❌ Erro ao buscar detalhe da nota ${id}:`, e.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // pausa para respeitar limite
    }

    // 5. Atualizar cache
    if (novosDetalhes.length > 0) {
      await fetch('https://metas-koala.onrender.com/api/nfe-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novosDetalhes)
      });
      console.log(`🗃️ Cache atualizado com ${novosDetalhes.length} novas notas`);

      // 6. Substituir IDs de loja por nomes
    } else {
      console.log('📭 Nenhuma nota detalhada foi adicionada');
    }

    substituirIdsDeLojaPorNome(novosDetalhes, cacheAtual);

    // 7. Resumo
    console.log(`🔚 Finalizado: ${novosDetalhes.length} salvas, ${redirects} 302, ${erros} erros`);
  } catch (err) {
    console.error('🔥 Erro geral ao atualizar notas:', err);
  }
}

// ✅ Função auxiliar para substituir IDs de loja pelos nomes
function substituirIdsDeLojaPorNome(novosDetalhes, cacheAtual) {
  console.log('🔄 Substituindo IDs de loja por nomes...');
  const caminhoLojas = './cache_loja.json';
  const raw = JSON.parse(fs.readFileSync(caminhoLojas, 'utf-8'));
  const lojas = raw.data || [];

  const mapaLojas = {};
  for (const loja of lojas) {
    if (loja?.id && loja?.descricao) {
      mapaLojas[loja.id] = loja.descricao;
    }
  }

  // Combinar detalhes existentes com os novos
  const mapaNotas = new Map();

  Object.values(cacheAtual).forEach(nf => {
    if (nf?.data?.id) {
      mapaNotas.set(nf.data.id, nf);
    }
  });
  
  novosDetalhes.forEach(nf => {
    if (nf?.data?.id) {
      mapaNotas.set(nf.data.id, nf);
    }
  });
  
  const detalhesCompletos = Array.from(mapaNotas.values());
  
  const detalhesAtualizados = detalhesCompletos.map(nf => {
    if (nf?.data?.loja?.id) {
      const idLoja = nf.data.loja.id;
      const nomeLoja = mapaLojas[idLoja];

      if (nomeLoja) {
        nf.data.loja = nomeLoja;
      }
    }
    return nf;
  });

  fs.writeFileSync(
    './cache_detalhes_atualizado.json',
    JSON.stringify(detalhesAtualizados, null, 2),
    'utf-8'
  );

  console.log('✅ IDs de loja substituídos por nomes e arquivo salvo como cache_detalhes_atualizado.json!');
}