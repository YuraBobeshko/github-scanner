const { ApolloServer, gql } = require('apollo-server');
const axios = require('axios');

const typeDefs = gql`
  type Repository {
    name: String
    size: Int
    owner: String
    forkedFrom: String
  }

  type RepositoryDetails {
    name: String
    size: Int
    owner: String
    isPrivate: Boolean
    numberOfFiles: Int
    ymlContent: String
    activeWebhooks: [String]
    forkedFrom: String
  }

  type Query {
    listRepositories(token: String!): [Repository]
    getRepositoryDetails(token: String!, owner: String!, repoName: String!): RepositoryDetails
  }
`;

const findYmlFileRecursively = async (owner, repoName, path = '', config) => {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, config);
    const files = response.data;

    for (const file of files) {
        if (file.type === 'file' && file.name.endsWith('.yml')) {
            return file;
        } else if (file.type === 'dir') {
            const ymlFile = await findYmlFileRecursively(owner, repoName, file.path, config);
            if (ymlFile) {
                return ymlFile;
            }
        }
    }
    return null;
};

const getRepositories = async (token) => {
    const config = {
        headers: { Authorization: `token ${token}` },
    };
    const response = await axios.get('https://api.github.com/user/repos?sort=created', config);

    return response.data.map(repo => ({
        name: repo.name,
        size: repo.size,
        owner: repo.owner.login,
        forkedFrom: repo.parent ? repo.parent.full_name : null
    }));
};

const getRepositoryDetails = async (token, owner, repoName) => {
    const config = {
        headers: { Authorization: `token ${token}` },
    };
    const repoResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, config);
    const repo = repoResponse.data;

    const contentsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/contents`, config);
    const files = contentsResponse.data;
    const numberOfFiles = files.length;
    const ymlFile = await findYmlFileRecursively(owner, repoName, '', config);

    let ymlContent = '';
    if (ymlFile) {
        const ymlResponse = await axios.get(ymlFile.download_url);
        ymlContent = ymlResponse.data;
    }

    const hooksResponse = await axios.get(`https://api.github.com/repos/${owner}/${repoName}/hooks`, config);
    const activeWebhooks = hooksResponse.data.map(hook => hook.config.url);

    return {
        name: repo.name,
        size: repo.size,
        owner: repo.owner.login,
        isPrivate: repo.private,
        numberOfFiles,
        ymlContent,
        activeWebhooks,
        forkedFrom: repo.parent ? repo.parent.full_name : null
    };
};

const resolvers = {
    Query: {
        listRepositories: async (_, { token }) => {
            try {
                return getRepositories(token);
            } catch (error) {
                throw new Error(JSON.stringify(error));
            }
        },
        getRepositoryDetails: async (_, { token, owner, repoName }) => {
            try {
                return getRepositoryDetails(token, owner, repoName);
            } catch (error) {
                throw new Error(JSON.stringify(error));
            }
        },
    },
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
});
